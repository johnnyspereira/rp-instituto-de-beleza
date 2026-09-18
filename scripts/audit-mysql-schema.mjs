import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

const directory = path.resolve('mysql/migrations');
const files = (await readdir(directory))
  .filter((name) => name.endsWith('.sql'))
  .sort();
const tables = new Map();
const errors = [];

function parts(value) {
  const result = [];
  let start = 0,
    depth = 0,
    quote = null;
  for (let index = 0; index < value.length; index++) {
    const char = value[index];
    if (quote) {
      if (char === quote && value[index - 1] !== '\\') quote = null;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      quote = char;
      continue;
    }
    if (char === '(') depth++;
    else if (char === ')') depth--;
    else if (char === ',' && depth === 0) {
      result.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  result.push(value.slice(start).trim());
  return result.filter(Boolean);
}

function verifyForeignKeys(sql, tableName, file) {
  const local = tables.get(tableName);
  const expression =
    /FOREIGN\s+KEY\s*\(\s*`?([\w]+)`?\s*\)\s+REFERENCES\s+`?([\w]+)`?\s*\(\s*`?([\w]+)`?\s*\)/gi;
  for (const match of sql.matchAll(expression)) {
    const [, column, target, targetColumn] = match;
    if (!local?.has(column))
      errors.push(`${file}: ${tableName}.${column} does not exist`);
    if (!tables.has(target))
      errors.push(`${file}: referenced table ${target} is not available yet`);
    else if (!tables.get(target).has(targetColumn))
      errors.push(
        `${file}: referenced column ${target}.${targetColumn} does not exist`
      );
  }
}

for (const file of files) {
  const source = await readFile(path.join(directory, file), 'utf8');
  if (/GENERATED\s+ALWAYS/i.test(source))
    errors.push(
      `${file}: generated columns are not allowed for cPanel MariaDB compatibility`
    );
  // Comments frequently precede DDL in our migrations. Remove them before
  // splitting so a valid CREATE/ALTER statement is not misclassified merely
  // because it starts with a descriptive comment.
  const statements = source
    .replace(/^\s*--.*$/gm, '')
    .split(/;\s*(?:\r?\n|$)/)
    .map((value) => value.trim())
    .filter(Boolean);
  for (const sql of statements) {
    const create = sql.match(
      /^CREATE\s+TABLE(?:\s+IF\s+NOT\s+EXISTS)?\s+`?([\w]+)`?\s*\(([\s\S]*)\)\s+ENGINE=/i
    );
    if (create) {
      const [, name, body] = create;
      const columns = new Set();
      for (const item of parts(body)) {
        const column = item.match(
          /^`?([\w]+)`?\s+(?!KEY\b|INDEX\b|CONSTRAINT\b|FOREIGN\b|PRIMARY\b|UNIQUE\b|CHECK\b)/i
        );
        if (column) columns.add(column[1]);
      }
      if (tables.has(name))
        errors.push(`${file}: table ${name} is declared more than once`);
      tables.set(name, columns);
      verifyForeignKeys(body, name, file);
      continue;
    }
    const alter = sql.match(/^ALTER\s+TABLE\s+`?([\w]+)`?\s+([\s\S]+)$/i);
    if (alter) {
      const [, name, actions] = alter;
      if (!tables.has(name)) {
        errors.push(`${file}: ALTER references missing table ${name}`);
        continue;
      }
      for (const action of parts(actions)) {
        const add = action.match(/^ADD\s+COLUMN\s+`?([\w]+)`?/i);
        if (add) tables.get(name).add(add[1]);
        const after = action.match(/\sAFTER\s+`?([\w]+)`?/i);
        if (after && !tables.get(name).has(after[1]))
          errors.push(
            `${file}: ${name} AFTER references missing column ${after[1]}`
          );
      }
      verifyForeignKeys(actions, name, file);
      continue;
    }
    // Standalone indexes don't alter the table-column model used by this
    // lightweight audit, but are valid MariaDB migration statements.
    if (/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+/i.test(sql)) continue;
    // Backfills and cleanup statements do not change the schema model.
    if (/^(INSERT|UPDATE|DELETE)\s+/i.test(sql)) continue;
    errors.push(
      `${file}: unsupported or unparsed SQL statement: ${sql.slice(0, 80)}`
    );
  }
}

if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(
  `MySQL schema audit passed: ${files.length} migrations, ${tables.size} tables, no unresolved references.`
);

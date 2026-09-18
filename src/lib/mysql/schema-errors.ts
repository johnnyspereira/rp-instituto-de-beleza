export function isMissingSchemaError(error: {
  code?: string;
  message?: string;
}) {
  const code = error.code?.toUpperCase();
  const message = error.message?.toLowerCase() ?? '';
  return (
    code === '42P01' ||
    code === '42703' ||
    code === 'PGRST204' ||
    code === 'ER_NO_SUCH_TABLE' ||
    code === 'ER_BAD_FIELD_ERROR' ||
    code === '1146' ||
    code === '1054' ||
    message.includes('schema cache') ||
    message.includes('does not exist') ||
    message.includes("doesn't exist") ||
    message.includes('unknown column') ||
    message.includes('table is not available')
  );
}

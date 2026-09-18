const http = require('node:http');

const port = Number(process.env.PORT || 3002);
const secret = String(process.env.AI_WORKER_SECRET || '').trim();
if (!secret) throw new Error('AI_WORKER_SECRET is required.');

function reply(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function readBody(req) {
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 1_000_000) throw new Error('Request too large.');
  }
  return raw ? JSON.parse(raw) : {};
}

function authorized(req) {
  return req.headers.authorization === `Bearer ${secret}`;
}

async function chat(input) {
  const model = String(input.model || '').trim();
  const messages = Array.isArray(input.messages) ? input.messages : [];
  if (!model || model.length > 120) throw new Error('A valid Ollama model is required.');
  const safeMessages = messages
    .filter((message) => message && ['system', 'user', 'assistant'].includes(message.role) && typeof message.content === 'string')
    .slice(-24)
    .map((message) => ({ role: message.role, content: message.content.slice(0, 16000) }));
  if (!safeMessages.length) throw new Error('At least one message is required.');
  const timeout = Math.min(60_000, Math.max(5_000, Number(input.timeout_ms) || 30_000));
  let response;
  try {
    response = await fetch('http://127.0.0.1:11434/v1/chat/completions', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: safeMessages, stream: false, max_tokens: Math.min(1024, Math.max(1, Number(input.max_completion_tokens) || 1024)) }),
      signal: AbortSignal.timeout(timeout),
    });
  } catch (error) {
    throw new Error(`Ollama local is unavailable: ${error.message || String(error)}`);
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error?.message || payload?.error || `Ollama HTTP ${response.status}`);
  return payload;
}

http.createServer(async (req, res) => {
  try {
    if (!authorized(req)) return reply(res, 401, { error: 'Unauthorized' });
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    if (req.method === 'GET' && url.pathname === '/status') return reply(res, 200, { ok: true, service: 'ollama-bridge' });
    if (req.method === 'POST' && url.pathname === '/ai/chat') return reply(res, 200, await chat(await readBody(req)));
    return reply(res, 404, { error: 'Not found' });
  } catch (error) {
    console.error('[ollama-bridge]', error);
    return reply(res, 502, { error: error.message || 'AI Worker error' });
  }
}).listen(port, '127.0.0.1', () => console.log(`Ollama AI Worker listening on 127.0.0.1:${port}`));

# Ollama AI Worker

Dedicated local bridge for Ollama. It never handles WhatsApp.

Set `AI_WORKER_SECRET` to a new secret, then run `npm start` in this folder.
Expose this bridge through a private authenticated tunnel/reverse proxy and set
`AI_WORKER_URL` and `AI_WORKER_SECRET` only in the CRM environment. Do not
expose Ollama port 11434 publicly.

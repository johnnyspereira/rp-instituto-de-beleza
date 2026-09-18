# Bridge WhatsApp local

Este processo roda no computador, nao no cPanel. Ele mantem o Chromium e a
sessao QR local e comunica com o CRM por HTTPS, sem Supabase.

1. Copie `.env.example` para `.env` e preencha `WORKER_SECRET` e `CRM_URL`.
2. Execute `npm install` e `npm start` nesta pasta.
3. Exponha a porta 4100 por um tunel HTTPS e configure a URL no cPanel como
   `WHATSAPP_WORKER_URL`. Use o mesmo segredo em `WHATSAPP_WORKER_SECRET`.
4. No cPanel configure tambem `WHATSAPP_MODE=remote_worker`.

As pastas `.wwebjs_cache` e `whatsapp_auth` devem ser preservadas. O computador
precisa permanecer ligado para enviar e receber mensagens por QR.

# Instalar o CRM com MySQL no cPanel

Esta versao roda integralmente no cPanel: aplicacao Node.js, banco MySQL/MariaDB,
autenticacao, ficheiros e sessao WhatsApp. Nao requer Supabase nem banco cloud.

## Aplicacao Node.js

No **Setup Node.js App**, use Node.js 22, modo `Production`, application root
`repositories/rp-instituto-de-beleza`, URL própria da clínica e startup file `server.cjs`.

No Terminal do cPanel, dentro do repositorio:

```bash
npm ci
npm run db:migrate:mysql
npm run build:cpanel
```

Depois clique em **Restart Application**. Nas atualizacoes, execute `git pull`,
os tres comandos acima e o restart, nessa ordem.

## Banco local

Em **MySQL Databases**, crie banco e utilizador e conceda **ALL PRIVILEGES**.
O phpMyAdmin serve para inspecionar/importar dados; a aplicacao conecta ao MySQL.

Cadastre no painel da aplicacao, nunca no Git:

```dotenv
NODE_ENV=production
DB_HOST=localhost
DB_PORT=3306
DB_NAME=PREFIXO_rp-instituto
DB_USER=PREFIXO_rp-instituto_app
DB_PASSWORD=SENHA_DO_BANCO
DB_CONNECTION_LIMIT=10
AUTH_SECRET=SEGREDO_ALEATORIO_DE_64_CARACTERES
NEXT_PUBLIC_SITE_URL=https://rp-instituto.example
NEXT_PUBLIC_APP_URL=https://rp-instituto.example
NEXT_PUBLIC_APP_LOCALE=pt
ALLOWED_INVITE_HOSTS=rp-instituto.example,www.rp-instituto.example
LOCAL_UPLOAD_DIR=/home/USUARIO/data/whatsappcrm/uploads
ENCRYPTION_KEY=64_CARACTERES_HEXADECIMAIS
AUTOMATION_CRON_SECRET=OUTRO_SEGREDO_LONGO
```

SMTP e Meta/WhatsApp sao opcionais e constam em `.env.local.example`. Nao
configure variaveis `SUPABASE_*`.

## WhatsApp QR pelo computador

Para evitar Chromium no cPanel, execute `workers/whatsapp-bridge` no computador
e exponha a porta 4100 por um tunel HTTPS. No cPanel configure
`WHATSAPP_MODE=remote_worker`, `WHATSAPP_WORKER_URL` e
`WHATSAPP_WORKER_SECRET`. O bridge usa esse mesmo segredo e grava os eventos no
MySQL atraves da API protegida do CRM; nao usa Supabase.

## Cron

Execute a cada minuto com `AUTOMATION_CRON_SECRET` no cabecalho:

```bash
curl -fsS -H "x-cron-secret: SEGREDO" https://rp-instituto.example/api/automations/cron
curl -fsS -H "x-cron-secret: SEGREDO" https://rp-instituto.example/api/flows/cron
curl -fsS -H "x-cron-secret: SEGREDO" https://rp-instituto.example/api/whatsapp/scheduled/process
```

Lembretes podem rodar a cada cinco minutos:

```bash
curl -fsS -H "x-cron-secret: SEGREDO" https://rp-instituto.example/api/clinic/appointments/reminders
curl -fsS -H "x-cron-secret: SEGREDO" https://rp-instituto.example/api/finance/reminders/process
```

Valide `/login`, `/inbox`, `/agenda`, upload, recuperacao de senha e a ligacao
WhatsApp. Em erro 503, confira Passenger log, `PORT`, `DB_*` e `server.cjs`.

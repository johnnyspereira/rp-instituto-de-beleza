# Instalação de teste em rp.jpmassagem.pt

O subdomínio `rp.jpmassagem.pt` é temporário. Esta instalação usa o repositório
privado `johnnyspereira/rp-instituto-de-beleza` e uma base de dados própria do RP.
Não reutilizar a base de dados, os segredos, os ficheiros ou a sessão WhatsApp da JP.

## Arquitetura do WhatsApp

O WhatsApp **não funciona dentro da hospedagem**. A sessão QR, o Chromium e o
`whatsapp-web.js` são executados pelo `workers/whatsapp-bridge` num computador
local. O cPanel aloja somente o site, o CRM, a API e a base MySQL. O worker local
comunica com o CRM por HTTPS usando `WHATSAPP_WORKER_URL` e um segredo partilhado.
Por isso, não instalar Puppeteer/Chromium no cPanel e não copiar a sessão WhatsApp
do computador para o servidor.

## DNS e alojamento

O subdomínio já está criado no cPanel da Domínios.pt, mas também precisa de um
registo DNS na zona `jpmassagem.pt` da Cloudflare. Criar um registo `A` para `rp`
apontado ao IP de origem do cPanel (ou `CNAME` para o hostname de origem indicado
pelo alojamento). Não usar os endereços públicos da Cloudflare obtidos por uma
consulta DNS de `jpmassagem.pt` como IP de origem. Confirmar que
`rp.jpmassagem.pt` resolve e tem certificado HTTPS válido antes de testar a app.

## Aplicação e base de dados

1. No cPanel, associar o utilizador `jpmassag_rp` à base `jpmassag_rp` e
   conceder **Todos os privilégios** para executar as migrações. Definir uma
   senha nova para este utilizador antes de publicar a aplicação.
2. Disponibilizar o repositório privado em
   `/home/jpmassag/repositories/rp-instituto-de-beleza`. Se usar o Git Version
   Control do cPanel, configurar uma chave de deploy **só de leitura** no GitHub.
   Em **Pull or Deploy**, clicar em **Update from Remote** e depois em **Deploy
   HEAD Commit**. O `.cpanel.yml` incluído no projeto cria o sinal de reinício do
   Passenger; a compilação é feita no passo 5, com o ambiente da aplicação.
3. Em **Setup Node.js App**, criar uma aplicação em modo `Production`, com Node.js
   22, raiz `repositories/rp-instituto-de-beleza`, URL `rp.jpmassagem.pt` e
   startup file `server.cjs`.
4. No ambiente da aplicação, definir os valores abaixo. Gerar segredos novos e
   guardar as credenciais apenas no cPanel:

   ```dotenv
   NODE_ENV=production
   NPM_CONFIG_INCLUDE=dev
   NPM_CONFIG_LEGACY_PEER_DEPS=true
   DB_HOST=localhost
   DB_PORT=3306
   DB_NAME=jpmassag_rp
   DB_USER=jpmassag_rp
   DB_PASSWORD=Eed8(Z%y,v8EVdRy
   AUTH_SECRET=<64_caracteres_hex_aleatorios>
   ENCRYPTION_KEY=<64_caracteres_hex_aleatorios>
   AUTOMATION_CRON_SECRET=<segredo_novo>
   NEXT_PUBLIC_SITE_URL=https://rp.jpmassagem.pt
   NEXT_PUBLIC_APP_URL=https://rp.jpmassagem.pt
   CANONICAL_APP_URL=https://rp.jpmassagem.pt
   APP_URL=https://rp.jpmassagem.pt
   ALLOWED_INVITE_HOSTS=rp.jpmassagem.pt
   NEXT_PUBLIC_APP_LOCALE=pt
   LOCAL_UPLOAD_DIR=/home/jpmassag/data/rp-instituto/uploads
   ```

5. Sem acesso ao Terminal, abrir a aplicação em **Setup Node.js App**. Confirmar
   primeiro que `NPM_CONFIG_INCLUDE=dev` e
   `NPM_CONFIG_LEGACY_PEER_DEPS=true` estão guardadas nas variáveis e remover a
   variável antiga `NPM_CONFIG_PRODUCTION`, se existir:
   - confirmar antes que `rp.jpmassagem.pt` já resolve no DNS e abre no browser;
   - clicar em **Run npm install** e esperar que termine sem erros;
   - clicar em **Run JS Script**, escolher `deploy:cpanel` e executar;
   - confirmar no resultado as mensagens `Applying MySQL migrations`,
     `Installing the prebuilt Next.js application` e `completed successfully`;
   - clicar em **Restart**.

   O script `deploy:cpanel` executa as migrações e instala o build preparado
   fora do alojamento, evitando os limites de memória do cPanel. Se
   o painel não mostrar **Run JS Script**, usar **Git Version Control > Manage >
   Pull or Deploy** com uma configuração `.cpanel.yml`, ou pedir à Domínios.pt
   que habilite a execução de scripts Node.js para a conta.
6. Configurar SMTP próprio do RP antes de testar convites e recuperação de senha.
   Deixar WhatsApp, pagamentos e envios automáticos desativados até existirem
   credenciais e números próprios do RP.

## Verificação

Confirmar que `/login` carrega por HTTPS, que o primeiro utilizador é criado
em `/install`, que o painel, a agenda e os uploads funcionam e que a aplicação
acede apenas à base RP. Rever identidade, contactos e textos públicos antes de
partilhar o endereço. A lista completa de verificações está em
[`deployment-cpanel.md`](deployment-cpanel.md).

## Passagem ao domínio oficial

Quando o domínio oficial do RP estiver definido, apontá-lo à **mesma instalação**
e à **mesma base RP**, emitir o certificado HTTPS e atualizar as cinco variáveis de
URL/host acima. Gerar novamente o pacote (`npm run build:cpanel:package`) porque as variáveis
`NEXT_PUBLIC_*` entram no build, reiniciar e testar login, links de email,
convites, callbacks e webhooks. Atualizar também URLs registadas nos serviços
externos e, só após validar o novo domínio, redirecionar o subdomínio de teste.

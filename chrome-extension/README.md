# AJ CRM Chrome Extension

Extensão MVP para usar o CRM dentro do WhatsApp Web.

## O que esta versão faz

- Injeta um painel lateral no `https://web.whatsapp.com`.
- Detecta a conversa aberta por nome e, quando o WhatsApp exibe, telefone.
- Permite configurar URL do CRM e API key.
- Busca cliente no CRM por telefone usando `/api/v1/contacts`.
- Cria ou atualiza cliente usando `/api/v1/contacts`.
- Abre Cliente 360, Inbox, Agenda e Financeiro no CRM.

## Como instalar no Chrome

1. Abra `chrome://extensions`.
2. Ative `Modo do desenvolvedor`.
3. Clique em `Carregar sem compactação`.
4. Selecione a pasta `chrome-extension`.
5. Abra `https://web.whatsapp.com`.

## Como configurar

1. Clique no ícone da extensão.
2. Informe a URL do CRM, por exemplo:
   `https://suporte.exemplo.pt`
3. Informe uma API key do CRM.

A API key precisa ter pelo menos:

- `contacts:read`
- `contacts:write`

## Observações importantes

O WhatsApp Web muda o HTML interno com frequência. A detecção de conversa nesta
primeira versão é propositalmente simples e pode precisar de ajustes após testes
reais no seu navegador.

Esta extensão não substitui o CRM. Ela é uma ponte visual para trabalhar dentro
do WhatsApp Web enquanto mantém os dados centralizados no CRM.

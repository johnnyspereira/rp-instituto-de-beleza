# RP Instituto de Beleza — preparação

Este repositório é uma cópia independente do código do CRM da JP Massagem, criada sem o histórico Git da JP. Não contém a base de dados, sessões do WhatsApp, ficheiros `.env` nem dados de clientes da JP.

## Antes de executar ou publicar

1. Criar uma base de dados MySQL nova e um utilizador exclusivo do RP.
2. Copiar `.env.local.example` para `.env.local` e preencher as credenciais próprias. O domínio `rp-instituto.example` é apenas um marcador; substituir pelo domínio real antes de publicar.
3. Definir `AUTH_SECRET`, `ENCRYPTION_KEY`, SMTP, domínio, número WhatsApp e chaves de integrações próprios do RP. Não copiar os valores da JP.
4. Instalar o RP com o nome **RP Instituto de Beleza** e configurar serviços, profissionais, salas, horários, preços e identidade visual.
5. Configurar, no CRM, a entidade responsável pelo tratamento de dados, NIF, morada e política de privacidade reais. A migração 020 já não preenche estes dados com informações da JP.
6. Rever todas as páginas públicas e mensagens antes de permitir clientes ou envios. A rota `/privacidade` usa o slug do portal configurado no banco; as referências `.example` impedem assumir um domínio que ainda não foi indicado.
7. Criar um processo de deploy próprio. A automação e os caminhos cPanel da JP foram removidos desta cópia.

## Correções partilhadas

Os repositórios são independentes. Uma alteração feita no JP não aparece no RP até ser guardada num commit e aplicada aqui. Na fase inicial, transportar apenas as alterações de código comuns, rever o diff e executar os testes antes de integrar. Não importar commits que incluam sessões do WhatsApp, ficheiros de ambiente, dados, identidade visual ou configuração da JP.

Quando os dois projetos estiverem estáveis, extrair as partes comuns para um pacote ou repositório base. Nessa fase, uma atualização do código comum pode abrir automaticamente uma proposta de atualização para o RP, mantendo a aprovação de alterações específicas da clínica.

O repositório RP está em `johnnyspereira/rp-instituto-de-beleza` (privado).
Para a instalação temporária em `rp.jpmassagem.pt`, consulte
[`staging-rp-jpmassagem.md`](staging-rp-jpmassagem.md).

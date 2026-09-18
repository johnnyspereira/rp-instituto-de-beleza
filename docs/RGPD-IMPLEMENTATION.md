# Matriz de adequação RGPD do CRM

Esta implementação fornece controlos técnicos de apoio à conformidade. Não é
uma certificação jurídica e não substitui a análise do responsável pelo
tratamento ou aconselhamento jurídico qualificado.

## Controlos implementados

- o consentimento de WhatsApp deixa de nascer ativo por defeito;
- finalidades operacionais, marketing, anamnese e aviso de privacidade passam
  a ter eventos históricos separados;
- a prova da anamnese inclui momento, versão do aviso e evidência técnica com
  o endereço IP transformado por SHA-256, sem guardar o IP em claro;
- Centro RGPD administrativo com identidade do responsável e matriz de
  conservação configurável;
- pedidos de acesso, retificação, apagamento, limitação, oposição, portabilidade
  e retirada de consentimento, incluindo prazo inicial;
- formulário de direitos no portal e exportação autenticada em JSON;
- estrutura para registo e acompanhamento de incidentes de dados pessoais.
- política pública versionada por portal, ligada aos consentimentos;
- registo de atividades de tratamento e inventário de subcontratantes;
- simulação de retenção e anonimização manual confirmada, com exclusão de
  registos financeiros e pedidos de titulares em curso;
- ciclo administrativo de verificação, decisão, recusa fundamentada,
  conclusão e auditoria dos pedidos;
- autenticação TOTP em dois fatores disponível nas definições de segurança.

## Decisões organizacionais pendentes

1. Confirmar fundamento jurídico e prazo de conservação de cada finalidade.
2. Publicar aviso de privacidade completo e acessível.
3. Completar o registo das atividades e avaliar uma AIPD para saúde e WhatsApp.
4. Assinar/rever contratos com os fornecedores inventariados no Centro RGPD.
5. Definir procedimento de violação e eventual notificação à CNPD.
6. Validar identidade antes de entregar, portar, corrigir ou apagar dados.
7. Aprovar exceções fiscais, clínicas e de defesa de direitos antes de apagar.
8. Rever acessos, backups, encriptação, recuperação e formação da equipa.

Os prazos configurados são uma matriz de decisão. Não executam eliminação
automática, evitando destruir registos sujeitos a conservação legal sem uma
validação prévia.

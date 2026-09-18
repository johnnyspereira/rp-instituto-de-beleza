ALTER TABLE privacy_processing_activities
  ADD COLUMN IF NOT EXISTS legal_reference VARCHAR(255) NULL;

INSERT INTO privacy_processing_activities
  (id, account_id, name, purposes, data_subjects, data_categories, legal_basis, legal_reference, recipients, retention_rule, security_measures)
SELECT UUID(), a.id, 'Agenda e prestação de serviços', 'Gerir pedidos, marcações, confirmações, alterações e prestação do serviço contratado', 'Clientes e potenciais clientes', 'Identificação, contactos, preferências, serviço, profissional, sala, datas e observações operacionais', 'contract', 'RGPD artigo 6.º, n.º 1, alínea b)', 'Equipa autorizada e fornecedores estritamente necessários', 'Conforme matriz de conservação; eliminação ou anonimização após o prazo aplicável', 'Controlo de acesso, registo de eventos e transmissão segura'
FROM accounts a WHERE NOT EXISTS (SELECT 1 FROM privacy_processing_activities p WHERE p.account_id=a.id AND p.name='Agenda e prestação de serviços');

INSERT INTO privacy_processing_activities
  (id, account_id, name, purposes, data_subjects, data_categories, legal_basis, legal_reference, recipients, retention_rule, security_measures)
SELECT UUID(), a.id, 'Faturação, pagamentos e benefícios', 'Cobrar serviços, emitir documentos, gerir packs, vouchers, saldos e cumprir obrigações contabilísticas e fiscais', 'Clientes, compradores e beneficiários', 'Identificação, NIF, contactos, transações, documentos fiscais e benefícios', 'legal_obligation', 'RGPD artigo 6.º, n.º 1, alíneas b) e c)', 'Autoridade Tributária, contabilista e prestadores de pagamento quando aplicável', 'Prazo legal fiscal aplicável, atualmente configurado na matriz RGPD', 'Perfis de acesso, auditoria financeira e integridade dos registos'
FROM accounts a WHERE NOT EXISTS (SELECT 1 FROM privacy_processing_activities p WHERE p.account_id=a.id AND p.name='Faturação, pagamentos e benefícios');

INSERT INTO privacy_processing_activities
  (id, account_id, name, purposes, data_subjects, data_categories, legal_basis, legal_reference, recipients, retention_rule, security_measures)
SELECT UUID(), a.id, 'Comunicações operacionais', 'Enviar confirmações, links de anamnese, alterações, lembretes e informação necessária ao serviço', 'Clientes', 'Nome, email, telefone, marcação e estado do serviço', 'contract', 'RGPD artigo 6.º, n.º 1, alínea b)', 'Fornecedores de email e WhatsApp', 'Conforme prazo de comunicações da matriz RGPD', 'Separação de finalidade, preferências de canal e histórico de entrega'
FROM accounts a WHERE NOT EXISTS (SELECT 1 FROM privacy_processing_activities p WHERE p.account_id=a.id AND p.name='Comunicações operacionais');

INSERT INTO privacy_processing_activities
  (id, account_id, name, purposes, data_subjects, data_categories, legal_basis, legal_reference, recipients, retention_rule, security_measures)
SELECT UUID(), a.id, 'Marketing por email e WhatsApp', 'Enviar campanhas, novidades e ofertas apenas nos canais autorizados', 'Clientes e interessados', 'Nome, email, telefone, preferências, consentimento e interações', 'consent', 'RGPD artigo 6.º, n.º 1, alínea a); Lei n.º 41/2004, artigo 13.º-A', 'Fornecedores de email e WhatsApp', 'Até retirada do consentimento ou prazo de inatividade aprovado', 'Consentimento granular, prova versionada e exclusão automática sem autorização'
FROM accounts a WHERE NOT EXISTS (SELECT 1 FROM privacy_processing_activities p WHERE p.account_id=a.id AND p.name='Marketing por email e WhatsApp');

INSERT INTO privacy_processing_activities
  (id, account_id, name, purposes, data_subjects, data_categories, legal_basis, special_category_basis, legal_reference, recipients, retention_rule, security_measures)
SELECT UUID(), a.id, 'Anamnese e dados de saúde', 'Adaptar o atendimento e reduzir riscos durante a prestação do serviço', 'Clientes que preenchem a ficha', 'Identificação, assinatura, respostas clínicas e dados de saúde', 'consent', 'explicit_consent', 'RGPD artigo 6.º, n.º 1, alínea a), e artigo 9.º, n.º 2, alínea a)', 'Somente profissionais autorizados e fornecedores técnicos sujeitos a contrato', 'Conforme prazo clínico aprovado na matriz RGPD', 'Consentimento explícito, versão do aviso, evidência, acesso restrito e auditoria'
FROM accounts a WHERE NOT EXISTS (SELECT 1 FROM privacy_processing_activities p WHERE p.account_id=a.id AND p.name='Anamnese e dados de saúde');

INSERT INTO privacy_processing_activities
  (id, account_id, name, purposes, data_subjects, data_categories, legal_basis, legal_reference, recipients, retention_rule, security_measures)
SELECT UUID(), a.id, 'Programa Indique e Ganhe', 'Registar a indicação, validar elegibilidade, contactar o indicado que aceita participar e atribuir recompensas', 'Clientes indicadores e pessoas indicadas', 'Nome, telefone, email, código, relação de indicação, marcação, pagamento e recompensa', 'consent', 'RGPD artigo 6.º, n.º 1, alínea a), e execução das condições do programa após adesão', 'Equipa autorizada e fornecedores de comunicação', 'Conforme prazo de contactos e obrigações financeiras aplicáveis', 'Consentimento no formulário, minimização e separação de marketing'
FROM accounts a WHERE NOT EXISTS (SELECT 1 FROM privacy_processing_activities p WHERE p.account_id=a.id AND p.name='Programa Indique e Ganhe');

UPDATE privacy_settings SET processing_purposes = JSON_OBJECT(
  'service', 'contract', 'billing', 'legal_obligation',
  'operational_communications', 'contract', 'marketing', 'consent',
  'health', 'explicit_consent', 'referrals', 'consent'
);

-- Uma conta a pagar representa uma obrigação com fornecedor/entidade.
-- O contacto CRM pertence somente a vendas e valores a receber.
UPDATE finance_payables
SET contact_id = NULL
WHERE contact_id IS NOT NULL;

CREATE INDEX finance_payables_supplier_due_idx
  ON finance_payables (account_id, supplier, due_date);

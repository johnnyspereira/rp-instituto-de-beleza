-- Permite registar descontos definidos no momento da marcação.
-- O desconto de indicação permanece separado para auditoria e POS.
ALTER TABLE clinic_appointments
  ADD COLUMN manual_discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0 AFTER original_price,
  ADD COLUMN manual_discount_reason VARCHAR(255) NULL AFTER manual_discount_amount;

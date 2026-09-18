CREATE TABLE finance_cash_sessions (
  id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL,
  opened_by_user_id CHAR(36), closed_by_user_id CHAR(36),
  status VARCHAR(16) NOT NULL DEFAULT 'open', opening_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  closing_counted_amount DECIMAL(12,2), expected_amount DECIMAL(12,2), difference_amount DECIMAL(12,2),
  notes TEXT, opened_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), closed_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX finance_cash_sessions_account_date(account_id, opened_at),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (opened_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL,
  FOREIGN KEY (closed_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE finance_pack_catalog (
  id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL, created_by_user_id CHAR(36),
  name VARCHAR(255) NOT NULL, description TEXT, reference VARCHAR(255), price DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'EUR', validity_days INT NOT NULL DEFAULT 365, is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX finance_pack_catalog_account(account_id, is_active), FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE finance_pack_items (
  id CHAR(36) PRIMARY KEY, pack_id CHAR(36) NOT NULL, service_id CHAR(36) NOT NULL, sessions INT NOT NULL,
  UNIQUE KEY finance_pack_item_unique(pack_id, service_id), FOREIGN KEY (pack_id) REFERENCES finance_pack_catalog(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES clinic_services(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE finance_sales (
  id CHAR(36) PRIMARY KEY, sale_number BIGINT NOT NULL AUTO_INCREMENT UNIQUE, account_id CHAR(36) NOT NULL,
  contact_id CHAR(36), appointment_id CHAR(36), cash_session_id CHAR(36), created_by_user_id CHAR(36),
  status VARCHAR(24) NOT NULL DEFAULT 'open', currency CHAR(3) NOT NULL DEFAULT 'EUR',
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0, discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0, total_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0, balance_due DECIMAL(12,2) NOT NULL DEFAULT 0,
  notes TEXT, completed_at DATETIME(3), voided_at DATETIME(3), void_reason TEXT, refund_reason TEXT,
  refunded_at DATETIME(3), reversed_by_user_id CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY finance_sales_account_number(account_id, sale_number), INDEX finance_sales_contact(contact_id, created_at),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE, FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  FOREIGN KEY (appointment_id) REFERENCES clinic_appointments(id) ON DELETE SET NULL,
  FOREIGN KEY (cash_session_id) REFERENCES finance_cash_sessions(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL,
  FOREIGN KEY (reversed_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE finance_sale_items (
  id CHAR(36) PRIMARY KEY, sale_id CHAR(36) NOT NULL, account_id CHAR(36) NOT NULL, item_type VARCHAR(24) NOT NULL,
  source_id CHAR(36), name_snapshot VARCHAR(255) NOT NULL, reference_snapshot VARCHAR(255), quantity DECIMAL(10,2) NOT NULL DEFAULT 1,
  unit_price DECIMAL(12,2) NOT NULL DEFAULT 0, discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  tax_rate DECIMAL(6,3) NOT NULL DEFAULT 0, tax_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(12,2) NOT NULL DEFAULT 0, metadata JSON, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX finance_sale_items_sale(sale_id), FOREIGN KEY (sale_id) REFERENCES finance_sales(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE finance_payments (
  id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL, sale_id CHAR(36) NOT NULL, cash_session_id CHAR(36), received_by_user_id CHAR(36),
  method VARCHAR(32) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'confirmed', amount DECIMAL(12,2) NOT NULL,
  reference_code VARCHAR(255), notes TEXT, paid_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX finance_payments_sale(sale_id), INDEX finance_payments_account_date(account_id, paid_at),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE, FOREIGN KEY (sale_id) REFERENCES finance_sales(id) ON DELETE CASCADE,
  FOREIGN KEY (cash_session_id) REFERENCES finance_cash_sessions(id) ON DELETE SET NULL,
  FOREIGN KEY (received_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE finance_vouchers (
  id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL, issued_sale_id CHAR(36), owner_contact_id CHAR(36), service_id CHAR(36),
  code VARCHAR(64) NOT NULL, pin_code VARCHAR(8) NOT NULL, voucher_type VARCHAR(24) NOT NULL DEFAULT 'gift_card', remaining_uses INT,
  initial_balance DECIMAL(12,2) NOT NULL, current_balance DECIMAL(12,2) NOT NULL, currency CHAR(3) NOT NULL DEFAULT 'EUR',
  status VARCHAR(16) NOT NULL DEFAULT 'active', recipient_name VARCHAR(255), message TEXT, expires_at DATETIME(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY finance_vouchers_account_code(account_id, code), INDEX finance_vouchers_contact(owner_contact_id, created_at),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE, FOREIGN KEY (issued_sale_id) REFERENCES finance_sales(id) ON DELETE SET NULL,
  FOREIGN KEY (owner_contact_id) REFERENCES contacts(id) ON DELETE SET NULL, FOREIGN KEY (service_id) REFERENCES clinic_services(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE finance_client_packs (
  id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL, contact_id CHAR(36) NOT NULL, pack_id CHAR(36) NOT NULL, sale_id CHAR(36),
  code VARCHAR(64) NOT NULL, pin_code VARCHAR(8) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'active',
  purchased_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), expires_at DATETIME(3), created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY finance_client_packs_account_code(account_id, code), FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE, FOREIGN KEY (pack_id) REFERENCES finance_pack_catalog(id) ON DELETE RESTRICT,
  FOREIGN KEY (sale_id) REFERENCES finance_sales(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE finance_client_pack_balances (
  id CHAR(36) PRIMARY KEY, client_pack_id CHAR(36) NOT NULL, service_id CHAR(36) NOT NULL,
  total_sessions INT NOT NULL, used_sessions INT NOT NULL DEFAULT 0, remaining_sessions INT NOT NULL,
  UNIQUE KEY finance_client_pack_balance_unique(client_pack_id, service_id),
  FOREIGN KEY (client_pack_id) REFERENCES finance_client_packs(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES clinic_services(id) ON DELETE RESTRICT
) ENGINE=InnoDB;

CREATE TABLE finance_appointment_benefits (
  id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL, appointment_id CHAR(36) NOT NULL, contact_id CHAR(36) NOT NULL,
  benefit_type VARCHAR(16) NOT NULL, voucher_id CHAR(36), client_pack_id CHAR(36), client_pack_balance_id CHAR(36), service_id CHAR(36),
  reserved_amount DECIMAL(12,2) NOT NULL DEFAULT 0, reserved_sessions INT NOT NULL DEFAULT 0, status VARCHAR(16) NOT NULL DEFAULT 'reserved',
  reserved_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), consumed_at DATETIME(3), released_at DATETIME(3), created_by_user_id CHAR(36),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX finance_benefits_appointment(appointment_id, status), INDEX finance_benefits_contact(contact_id, created_at),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE, FOREIGN KEY (appointment_id) REFERENCES clinic_appointments(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE, FOREIGN KEY (voucher_id) REFERENCES finance_vouchers(id) ON DELETE RESTRICT,
  FOREIGN KEY (client_pack_id) REFERENCES finance_client_packs(id) ON DELETE RESTRICT,
  FOREIGN KEY (client_pack_balance_id) REFERENCES finance_client_pack_balances(id) ON DELETE RESTRICT,
  FOREIGN KEY (service_id) REFERENCES clinic_services(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE referral_program_settings (
  account_id CHAR(36) PRIMARY KEY, enabled BOOLEAN NOT NULL DEFAULT FALSE, headline VARCHAR(255) NOT NULL,
  description TEXT NOT NULL, terms TEXT, qualification_event VARCHAR(32) NOT NULL DEFAULT 'first_paid_sale',
  referrer_reward_type VARCHAR(24) NOT NULL DEFAULT 'fixed_credit', referrer_reward_value DECIMAL(12,2) NOT NULL DEFAULT 10,
  referrer_service_id CHAR(36), friend_reward_type VARCHAR(24) NOT NULL DEFAULT 'percentage', friend_reward_value DECIMAL(12,2) NOT NULL DEFAULT 10,
  friend_service_id CHAR(36), reward_validity_days INT NOT NULL DEFAULT 90, max_rewards_per_referrer INT, require_consent BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE, FOREIGN KEY (referrer_service_id) REFERENCES clinic_services(id) ON DELETE SET NULL,
  FOREIGN KEY (friend_service_id) REFERENCES clinic_services(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE referral_codes (
  id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL, contact_id CHAR(36) NOT NULL, code VARCHAR(64) NOT NULL, is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY referral_codes_contact(account_id, contact_id), UNIQUE KEY referral_codes_code(account_id, code),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE, FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE referrals (
  id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL, referral_code_id CHAR(36) NOT NULL, referrer_contact_id CHAR(36) NOT NULL,
  friend_contact_id CHAR(36), friend_name VARCHAR(255) NOT NULL, friend_phone VARCHAR(64) NOT NULL, friend_phone_normalized VARCHAR(64) NOT NULL,
  friend_email VARCHAR(320), status VARCHAR(16) NOT NULL DEFAULT 'registered', qualification_event VARCHAR(64), source VARCHAR(64) NOT NULL DEFAULT 'public_page',
  consent_at DATETIME(3), registered_at DATETIME(3), qualified_at DATETIME(3), rewarded_at DATETIME(3), rejected_at DATETIME(3), rejection_reason TEXT,
  metadata JSON, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY referrals_friend_phone(account_id, friend_phone_normalized), INDEX referrals_status(account_id, status, created_at),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE, FOREIGN KEY (referral_code_id) REFERENCES referral_codes(id) ON DELETE RESTRICT,
  FOREIGN KEY (referrer_contact_id) REFERENCES contacts(id) ON DELETE RESTRICT, FOREIGN KEY (friend_contact_id) REFERENCES contacts(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE referral_rewards (
  id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL, referral_id CHAR(36) NOT NULL, beneficiary_type VARCHAR(16) NOT NULL,
  contact_id CHAR(36), reward_type VARCHAR(24) NOT NULL, reward_value DECIMAL(12,2) NOT NULL DEFAULT 0, service_id CHAR(36),
  status VARCHAR(16) NOT NULL DEFAULT 'pending', reward_code VARCHAR(64) NOT NULL, expires_at DATETIME(3), issued_at DATETIME(3), redeemed_at DATETIME(3),
  issued_by_user_id CHAR(36), issued_wallet_id CHAR(36), metadata JSON,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY referral_rewards_beneficiary(referral_id, beneficiary_type), INDEX referral_rewards_contact(contact_id, status, created_at),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE, FOREIGN KEY (referral_id) REFERENCES referrals(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL, FOREIGN KEY (service_id) REFERENCES clinic_services(id) ON DELETE SET NULL,
  FOREIGN KEY (issued_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE finance_client_wallets (
  id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL, contact_id CHAR(36) NOT NULL, currency CHAR(3) NOT NULL DEFAULT 'EUR',
  balance DECIMAL(12,2) NOT NULL DEFAULT 0, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY finance_wallet_contact(account_id, contact_id, currency), FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
) ENGINE=InnoDB;

ALTER TABLE referral_rewards ADD CONSTRAINT referral_reward_wallet_fk FOREIGN KEY (issued_wallet_id) REFERENCES finance_client_wallets(id) ON DELETE SET NULL;

CREATE TABLE finance_wallet_transactions (
  id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL, wallet_id CHAR(36) NOT NULL, transaction_type VARCHAR(16) NOT NULL,
  amount DECIMAL(12,2) NOT NULL, balance_after DECIMAL(12,2) NOT NULL, referral_reward_id CHAR(36), sale_id CHAR(36), payment_id CHAR(36),
  performed_by_user_id CHAR(36), description TEXT, metadata JSON, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY finance_wallet_referral(referral_reward_id), UNIQUE KEY finance_wallet_payment(payment_id), INDEX finance_wallet_ledger(wallet_id, created_at),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE, FOREIGN KEY (wallet_id) REFERENCES finance_client_wallets(id) ON DELETE CASCADE,
  FOREIGN KEY (referral_reward_id) REFERENCES referral_rewards(id) ON DELETE SET NULL, FOREIGN KEY (sale_id) REFERENCES finance_sales(id) ON DELETE SET NULL,
  FOREIGN KEY (payment_id) REFERENCES finance_payments(id) ON DELETE SET NULL, FOREIGN KEY (performed_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE finance_stock_movements (
  id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL, product_id CHAR(36) NOT NULL, sale_id CHAR(36), user_id CHAR(36),
  movement_type VARCHAR(16) NOT NULL, quantity INT NOT NULL, stock_after INT NOT NULL, notes TEXT,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX finance_stock_product(product_id, created_at),
  FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE, FOREIGN KEY (product_id) REFERENCES clinic_products(id) ON DELETE RESTRICT,
  FOREIGN KEY (sale_id) REFERENCES finance_sales(id) ON DELETE SET NULL, FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

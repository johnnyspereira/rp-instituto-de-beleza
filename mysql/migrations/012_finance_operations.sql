ALTER TABLE finance_cash_sessions ADD COLUMN opening_breakdown JSON NULL AFTER opening_amount;
ALTER TABLE referrals ADD COLUMN contacted_at DATETIME(3), ADD COLUMN scheduled_at DATETIME(3), ADD COLUMN lost_at DATETIME(3), ADD COLUMN lost_reason TEXT;
ALTER TABLE referral_rewards ADD COLUMN issued_voucher_id CHAR(36), ADD CONSTRAINT referral_reward_voucher_fk FOREIGN KEY (issued_voucher_id) REFERENCES finance_vouchers(id) ON DELETE SET NULL;

CREATE TABLE referral_events (
 id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL, referral_id CHAR(36) NOT NULL, action VARCHAR(32) NOT NULL,
 reason TEXT, actor_user_id CHAR(36), metadata JSON, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX referral_events_referral(referral_id,created_at), FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE,
 FOREIGN KEY(referral_id) REFERENCES referrals(id) ON DELETE CASCADE, FOREIGN KEY(actor_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE finance_benefit_logs (
 id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL, voucher_id CHAR(36), client_pack_id CHAR(36), appointment_id CHAR(36),
 action VARCHAR(24) NOT NULL, amount DECIMAL(12,2) NOT NULL DEFAULT 0, sessions INT NOT NULL DEFAULT 0,
 performed_by_user_id CHAR(36), performed_by_name VARCHAR(255), approved_by_user_id CHAR(36), approved_by_name VARCHAR(255), notes TEXT, metadata JSON,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX benefit_logs_voucher(voucher_id,created_at), INDEX benefit_logs_pack(client_pack_id,created_at),
 FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE, FOREIGN KEY(voucher_id) REFERENCES finance_vouchers(id) ON DELETE CASCADE,
 FOREIGN KEY(client_pack_id) REFERENCES finance_client_packs(id) ON DELETE CASCADE, FOREIGN KEY(appointment_id) REFERENCES clinic_appointments(id) ON DELETE SET NULL,
 FOREIGN KEY(performed_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL, FOREIGN KEY(approved_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE finance_cash_movements (
 id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL, cash_session_id CHAR(36) NOT NULL, movement_type VARCHAR(24) NOT NULL,
 amount DECIMAL(12,2) NOT NULL, description TEXT NOT NULL, reference VARCHAR(255), sale_id CHAR(36), payment_id CHAR(36), created_by_user_id CHAR(36),
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX cash_movements_session(cash_session_id,created_at),
 FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE, FOREIGN KEY(cash_session_id) REFERENCES finance_cash_sessions(id) ON DELETE CASCADE,
 FOREIGN KEY(sale_id) REFERENCES finance_sales(id) ON DELETE SET NULL, FOREIGN KEY(payment_id) REFERENCES finance_payments(id) ON DELETE SET NULL,
 FOREIGN KEY(created_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE finance_audit_events (
 id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL, entity_type VARCHAR(32) NOT NULL, entity_id CHAR(36) NOT NULL,
 action VARCHAR(64) NOT NULL, actor_user_id CHAR(36), reason TEXT, metadata JSON, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX finance_audit_account(account_id,created_at), INDEX finance_audit_entity(entity_type,entity_id,created_at),
 FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE, FOREIGN KEY(actor_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE finance_invoice_requests (
 id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL, sale_id CHAR(36) NOT NULL, contact_id CHAR(36) NOT NULL, requested_by_auth_user_id CHAR(36),
 status VARCHAR(24) NOT NULL DEFAULT 'pending', fiscal_name VARCHAR(255) NOT NULL, tax_id VARCHAR(64) NOT NULL, email VARCHAR(320) NOT NULL,
 address_line TEXT, postal_code VARCHAR(32), city VARCHAR(255), country VARCHAR(128) NOT NULL DEFAULT 'Portugal', client_notes TEXT,
 invoice_number VARCHAR(128), invoice_document_url TEXT, admin_notes TEXT, handled_by_user_id CHAR(36), requested_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 processing_at DATETIME(3), completed_at DATETIME(3), fiscal_provider VARCHAR(64), fiscal_document_id VARCHAR(255), fiscal_document_type VARCHAR(32) NOT NULL DEFAULT 'invoice',
 fiscal_status VARCHAR(24) NOT NULL DEFAULT 'not_sent', fiscal_error TEXT, fiscal_payload JSON, fiscal_sent_at DATETIME(3), fiscal_issued_at DATETIME(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), UNIQUE KEY invoice_sale(account_id,sale_id),
 INDEX invoice_queue(account_id,status,requested_at), FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE,
 FOREIGN KEY(sale_id) REFERENCES finance_sales(id) ON DELETE CASCADE, FOREIGN KEY(contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
 FOREIGN KEY(requested_by_auth_user_id) REFERENCES app_users(id) ON DELETE SET NULL, FOREIGN KEY(handled_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE finance_payables (
 id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL, description TEXT NOT NULL, supplier VARCHAR(255), category VARCHAR(128) NOT NULL DEFAULT 'Outros',
 amount DECIMAL(12,2) NOT NULL, currency CHAR(3) NOT NULL DEFAULT 'EUR', due_date DATE NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'pending',
 paid_at DATETIME(3), payment_method VARCHAR(64), notes TEXT, correction_reason TEXT, cancelled_at DATETIME(3), created_by_user_id CHAR(36),
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 INDEX payables_due(account_id,due_date,status), FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE, FOREIGN KEY(created_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE finance_receivable_schedules (
 id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL, sale_id CHAR(36), voucher_id CHAR(36), contact_id CHAR(36), description TEXT NOT NULL,
 amount DECIMAL(12,2) NOT NULL, currency CHAR(3) NOT NULL DEFAULT 'EUR', due_date DATE NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'pending',
 received_at DATETIME(3), notes TEXT, correction_reason TEXT, cancelled_at DATETIME(3), cash_movement_id CHAR(36), created_by_user_id CHAR(36),
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 INDEX receivables_due(account_id,due_date,status), FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE,
 FOREIGN KEY(sale_id) REFERENCES finance_sales(id) ON DELETE CASCADE, FOREIGN KEY(voucher_id) REFERENCES finance_vouchers(id) ON DELETE SET NULL,
 FOREIGN KEY(contact_id) REFERENCES contacts(id) ON DELETE SET NULL, FOREIGN KEY(cash_movement_id) REFERENCES finance_cash_movements(id) ON DELETE SET NULL,
 FOREIGN KEY(created_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE finance_treasury_events (
 id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL, entity_type VARCHAR(16) NOT NULL, entity_id CHAR(36) NOT NULL, action VARCHAR(24) NOT NULL,
 actor_user_id CHAR(36), before_data JSON, after_data JSON, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX treasury_entity(account_id,entity_type,entity_id,created_at), FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE,
 FOREIGN KEY(actor_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE finance_fund_accounts (
 id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL, name VARCHAR(80) NOT NULL, account_type VARCHAR(16) NOT NULL, institution VARCHAR(255),
 currency CHAR(3) NOT NULL DEFAULT 'EUR', is_active BOOLEAN NOT NULL DEFAULT TRUE, created_by_user_id CHAR(36),
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 UNIQUE KEY fund_account_name(account_id,name), FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE,
 FOREIGN KEY(created_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE finance_fund_transfers (
 id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL, source_account_id CHAR(36) NOT NULL, destination_account_id CHAR(36) NOT NULL,
 amount DECIMAL(14,2) NOT NULL, currency CHAR(3) NOT NULL DEFAULT 'EUR', description TEXT, created_by_user_id CHAR(36), created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX fund_transfers_date(account_id,created_at), FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE,
 FOREIGN KEY(source_account_id) REFERENCES finance_fund_accounts(id), FOREIGN KEY(destination_account_id) REFERENCES finance_fund_accounts(id),
 FOREIGN KEY(created_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE finance_fund_transactions (
 id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL, fund_account_id CHAR(36) NOT NULL, cash_session_id CHAR(36), transfer_id CHAR(36),
 direction VARCHAR(8) NOT NULL, transaction_type VARCHAR(32) NOT NULL, amount DECIMAL(14,2) NOT NULL, description TEXT NOT NULL, reference VARCHAR(255),
 created_by_user_id CHAR(36), created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX fund_transactions_date(account_id,fund_account_id,created_at),
 FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE, FOREIGN KEY(fund_account_id) REFERENCES finance_fund_accounts(id),
 FOREIGN KEY(cash_session_id) REFERENCES finance_cash_sessions(id) ON DELETE SET NULL, FOREIGN KEY(transfer_id) REFERENCES finance_fund_transfers(id),
 FOREIGN KEY(created_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE finance_voucher_transfer_requests (
 id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL, voucher_id CHAR(36) NOT NULL, recipient_name VARCHAR(160) NOT NULL,
 recipient_phone VARCHAR(30) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'pending', reviewed_by_user_id CHAR(36), reviewed_at DATETIME(3), notes TEXT,
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 INDEX voucher_transfer_status(account_id,status,created_at), FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE,
 FOREIGN KEY(voucher_id) REFERENCES finance_vouchers(id) ON DELETE CASCADE, FOREIGN KEY(reviewed_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE finance_payment_links (
 id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL, sale_id CHAR(36), contact_id CHAR(36), provider VARCHAR(64) NOT NULL DEFAULT 'manual',
 status VARCHAR(16) NOT NULL DEFAULT 'draft', amount DECIMAL(12,2) NOT NULL, currency CHAR(3) NOT NULL DEFAULT 'EUR', description TEXT,
 external_reference VARCHAR(255), external_session_id VARCHAR(255), external_payment_intent_id VARCHAR(255), provider_payload JSON,
 payment_url TEXT, expires_at DATETIME(3), paid_at DATETIME(3), created_by_user_id CHAR(36), created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), INDEX payment_links_status(account_id,status,created_at),
 UNIQUE KEY payment_link_session(provider,external_session_id), FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE,
 FOREIGN KEY(sale_id) REFERENCES finance_sales(id) ON DELETE SET NULL, FOREIGN KEY(contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
 FOREIGN KEY(created_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE finance_fiscal_documents (
 id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL, invoice_request_id CHAR(36), sale_id CHAR(36), contact_id CHAR(36), provider VARCHAR(64) NOT NULL,
 document_type VARCHAR(32) NOT NULL DEFAULT 'invoice', status VARCHAR(24) NOT NULL DEFAULT 'draft', external_document_id VARCHAR(255), document_number VARCHAR(255),
 document_url TEXT, document_path TEXT, error_message TEXT, payload JSON, issued_at DATETIME(3), created_by_user_id CHAR(36),
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 INDEX fiscal_status(account_id,provider,status,created_at), UNIQUE KEY fiscal_external(provider,external_document_id),
 FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE, FOREIGN KEY(invoice_request_id) REFERENCES finance_invoice_requests(id) ON DELETE SET NULL,
 FOREIGN KEY(sale_id) REFERENCES finance_sales(id) ON DELETE SET NULL, FOREIGN KEY(contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
 FOREIGN KEY(created_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE finance_goals (
 id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL, title VARCHAR(255) NOT NULL, category VARCHAR(24) NOT NULL DEFAULT 'other', goal_type VARCHAR(24) NOT NULL DEFAULT 'manual',
 target_amount DECIMAL(12,2) NOT NULL, current_amount DECIMAL(12,2) NOT NULL DEFAULT 0, currency CHAR(3) NOT NULL DEFAULT 'EUR', period_start DATE NOT NULL,
 period_end DATE, status VARCHAR(16) NOT NULL DEFAULT 'active', alert_threshold_percent DECIMAL(5,2) NOT NULL DEFAULT 75, notes TEXT, created_by_user_id CHAR(36),
 created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 INDEX goals_status(account_id,status,period_end), FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE, FOREIGN KEY(created_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE finance_goal_entries (
 id CHAR(36) PRIMARY KEY, account_id CHAR(36) NOT NULL, goal_id CHAR(36) NOT NULL, entry_type VARCHAR(24) NOT NULL DEFAULT 'contribution', amount DECIMAL(12,2) NOT NULL,
 occurred_on DATE NOT NULL, notes TEXT, created_by_user_id CHAR(36), created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), INDEX goal_entries_date(goal_id,occurred_on,created_at),
 FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE, FOREIGN KEY(goal_id) REFERENCES finance_goals(id) ON DELETE CASCADE,
 FOREIGN KEY(created_by_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE finance_reminder_settings (
 account_id CHAR(36) PRIMARY KEY, payables_enabled BOOLEAN NOT NULL DEFAULT TRUE, payable_days_before JSON, overdue_daily BOOLEAN NOT NULL DEFAULT TRUE,
 cash_enabled BOOLEAN NOT NULL DEFAULT TRUE, timezone VARCHAR(128) NOT NULL DEFAULT 'Europe/Lisbon', cash_open_time TIME NOT NULL DEFAULT '09:00:00',
 cash_close_time TIME NOT NULL DEFAULT '22:00:00', close_repeat_minutes INT NOT NULL DEFAULT 30, whatsapp_enabled BOOLEAN NOT NULL DEFAULT FALSE,
 whatsapp_phone VARCHAR(32), created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3), updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE finance_reminder_deliveries (
 id CHAR(36) PRIMARY KEY, notification_id CHAR(36) NOT NULL UNIQUE, account_id CHAR(36) NOT NULL, channel VARCHAR(16) NOT NULL,
 recipient VARCHAR(64) NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'pending', attempts INT NOT NULL DEFAULT 0, next_attempt_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 sent_at DATETIME(3), whatsapp_message_id VARCHAR(255), last_error TEXT, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3), INDEX reminder_due(status,next_attempt_at),
 FOREIGN KEY(notification_id) REFERENCES notifications(id) ON DELETE CASCADE, FOREIGN KEY(account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB;

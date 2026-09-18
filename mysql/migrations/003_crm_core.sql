CREATE TABLE IF NOT EXISTS contacts (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  phone VARCHAR(50) NOT NULL,
  name VARCHAR(255) NULL,
  email VARCHAR(320) NULL,
  company VARCHAR(255) NULL,
  avatar_url TEXT NULL,
  client_reference VARCHAR(50) NULL,
  birth_date DATE NULL,
  tax_id VARCHAR(100) NULL,
  gender ENUM('male', 'female', 'non_binary', 'not_informed') NULL,
  address_line TEXT NULL,
  postal_code VARCHAR(30) NULL,
  city VARCHAR(150) NULL,
  country VARCHAR(150) NULL DEFAULT 'Portugal',
  source VARCHAR(150) NULL,
  preferred_contact ENUM('whatsapp', 'phone', 'email') NULL DEFAULT 'whatsapp',
  marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
  whatsapp_consent BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY contacts_account_phone_unique (account_id, phone),
  UNIQUE KEY contacts_account_client_reference_unique
    (account_id, client_reference),
  KEY contacts_user_id_idx (user_id),
  KEY contacts_account_created_idx (account_id, created_at),
  KEY contacts_account_tax_id_idx (account_id, tax_id),
  CONSTRAINT contacts_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT contacts_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tags (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  color VARCHAR(20) NOT NULL DEFAULT '#3b82f6',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY tags_account_name_unique (account_id, name),
  CONSTRAINT tags_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT tags_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contact_tags (
  id CHAR(36) NOT NULL,
  contact_id CHAR(36) NOT NULL,
  tag_id CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY contact_tags_contact_tag_unique (contact_id, tag_id),
  KEY contact_tags_tag_id_idx (tag_id),
  CONSTRAINT contact_tags_contact_id_fk
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  CONSTRAINT contact_tags_tag_id_fk
    FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS custom_fields (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  field_name VARCHAR(255) NOT NULL,
  field_type VARCHAR(50) NOT NULL DEFAULT 'text',
  field_options JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY custom_fields_account_id_idx (account_id),
  CONSTRAINT custom_fields_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT custom_fields_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contact_custom_values (
  id CHAR(36) NOT NULL,
  contact_id CHAR(36) NOT NULL,
  custom_field_id CHAR(36) NOT NULL,
  value TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY contact_custom_values_contact_field_unique
    (contact_id, custom_field_id),
  KEY contact_custom_values_field_id_idx (custom_field_id),
  CONSTRAINT contact_custom_values_contact_id_fk
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  CONSTRAINT contact_custom_values_field_id_fk
    FOREIGN KEY (custom_field_id) REFERENCES custom_fields(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contact_notes (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  contact_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  note_text TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY contact_notes_account_contact_idx (account_id, contact_id, created_at),
  CONSTRAINT contact_notes_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT contact_notes_contact_id_fk
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  CONSTRAINT contact_notes_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS conversations (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  contact_id CHAR(36) NOT NULL,
  status ENUM('open', 'pending', 'closed') NOT NULL DEFAULT 'open',
  assigned_agent_id CHAR(36) NULL,
  last_message_text TEXT NULL,
  last_message_at DATETIME(3) NULL,
  unread_count INT NOT NULL DEFAULT 0,
  ai_autoreply_disabled BOOLEAN NOT NULL DEFAULT FALSE,
  ai_reply_count INT NOT NULL DEFAULT 0,
  ai_handoff_summary TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY conversations_account_contact_unique (account_id, contact_id),
  KEY conversations_account_last_message_idx (account_id, last_message_at),
  KEY conversations_assigned_agent_idx (assigned_agent_id),
  CONSTRAINT conversations_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT conversations_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
  CONSTRAINT conversations_contact_id_fk
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  CONSTRAINT conversations_assigned_agent_id_fk
    FOREIGN KEY (assigned_agent_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messages (
  id CHAR(36) NOT NULL,
  conversation_id CHAR(36) NOT NULL,
  sender_type ENUM('customer', 'agent', 'bot') NOT NULL,
  sender_id CHAR(36) NULL,
  content_type ENUM(
    'text', 'image', 'document', 'audio', 'video', 'location',
    'template', 'interactive'
  ) NOT NULL DEFAULT 'text',
  content_text LONGTEXT NULL,
  media_url TEXT NULL,
  template_name VARCHAR(255) NULL,
  message_id VARCHAR(255) NULL,
  status ENUM('sending', 'sent', 'delivered', 'read', 'failed')
    NOT NULL DEFAULT 'sent',
  reply_to_message_id CHAR(36) NULL,
  interactive_reply_id VARCHAR(255) NULL,
  interactive_payload JSON NULL,
  ai_generated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY messages_conversation_created_idx (conversation_id, created_at),
  KEY messages_message_id_idx (message_id),
  KEY messages_reply_to_idx (reply_to_message_id),
  CONSTRAINT messages_conversation_id_fk
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  CONSTRAINT messages_reply_to_message_id_fk
    FOREIGN KEY (reply_to_message_id) REFERENCES messages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS message_reactions (
  id CHAR(36) NOT NULL,
  message_id CHAR(36) NOT NULL,
  conversation_id CHAR(36) NOT NULL,
  actor_type ENUM('customer', 'agent') NOT NULL,
  actor_id CHAR(36) NULL,
  emoji VARCHAR(64) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY message_reactions_actor_unique
    (message_id, actor_type, actor_id),
  KEY message_reactions_conversation_idx (conversation_id),
  CONSTRAINT message_reactions_message_id_fk
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE,
  CONSTRAINT message_reactions_conversation_id_fk
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS whatsapp_config (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  phone_number_id VARCHAR(255) NOT NULL,
  waba_id VARCHAR(255) NULL,
  access_token TEXT NOT NULL,
  verify_token TEXT NULL,
  status ENUM('connected', 'disconnected') NOT NULL DEFAULT 'disconnected',
  connected_at DATETIME(3) NULL,
  registered_at DATETIME(3) NULL,
  subscribed_apps_at DATETIME(3) NULL,
  last_registration_error TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY whatsapp_config_account_id_unique (account_id),
  UNIQUE KEY whatsapp_config_phone_number_id_unique (phone_number_id),
  CONSTRAINT whatsapp_config_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT whatsapp_config_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS message_templates (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  category ENUM('MARKETING', 'UTILITY', 'AUTHENTICATION') NOT NULL DEFAULT 'MARKETING',
  language VARCHAR(35) NOT NULL DEFAULT 'pt_PT',
  header_type ENUM('text', 'image', 'video', 'document') NULL,
  header_content TEXT NULL,
  body_text LONGTEXT NOT NULL,
  footer_text TEXT NULL,
  buttons JSON NULL,
  sample_values JSON NULL,
  meta_template_id VARCHAR(255) NULL,
  rejection_reason TEXT NULL,
  quality_score ENUM('GREEN', 'YELLOW', 'RED') NULL,
  header_handle TEXT NULL,
  header_media_url TEXT NULL,
  submission_error TEXT NULL,
  last_submitted_at DATETIME(3) NULL,
  status ENUM(
    'DRAFT', 'PENDING', 'APPROVED', 'REJECTED', 'PAUSED', 'DISABLED',
    'IN_APPEAL', 'PENDING_DELETION'
  ) NOT NULL DEFAULT 'DRAFT',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY message_templates_account_name_language_unique
    (account_id, name, language),
  CONSTRAINT message_templates_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT message_templates_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pipelines (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY pipelines_account_id_idx (account_id),
  CONSTRAINT pipelines_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT pipelines_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id CHAR(36) NOT NULL,
  pipeline_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  position INT NOT NULL DEFAULT 0,
  color VARCHAR(20) NOT NULL DEFAULT '#3b82f6',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY pipeline_stages_pipeline_position_idx (pipeline_id, position),
  CONSTRAINT pipeline_stages_pipeline_id_fk
    FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS deals (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  pipeline_id CHAR(36) NOT NULL,
  stage_id CHAR(36) NOT NULL,
  contact_id CHAR(36) NULL,
  conversation_id CHAR(36) NULL,
  assigned_to CHAR(36) NULL,
  title VARCHAR(255) NOT NULL,
  value DECIMAL(12,2) NOT NULL DEFAULT 0,
  currency CHAR(3) NOT NULL DEFAULT 'EUR',
  notes TEXT NULL,
  expected_close_date DATE NULL,
  status ENUM('open', 'won', 'lost') NOT NULL DEFAULT 'open',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY deals_account_stage_idx (account_id, stage_id),
  KEY deals_pipeline_idx (pipeline_id),
  KEY deals_assigned_to_idx (assigned_to),
  CONSTRAINT deals_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT deals_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
  CONSTRAINT deals_pipeline_id_fk
    FOREIGN KEY (pipeline_id) REFERENCES pipelines(id) ON DELETE CASCADE,
  CONSTRAINT deals_stage_id_fk
    FOREIGN KEY (stage_id) REFERENCES pipeline_stages(id) ON DELETE RESTRICT,
  CONSTRAINT deals_contact_id_fk
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  CONSTRAINT deals_conversation_id_fk
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
  CONSTRAINT deals_assigned_to_fk
    FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS broadcasts (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  template_name VARCHAR(255) NOT NULL,
  template_language VARCHAR(35) NOT NULL DEFAULT 'pt_PT',
  template_variables JSON NULL,
  audience_filter JSON NULL,
  scheduled_at DATETIME(3) NULL,
  status ENUM('draft', 'scheduled', 'sending', 'sent', 'failed')
    NOT NULL DEFAULT 'draft',
  total_recipients INT NOT NULL DEFAULT 0,
  sent_count INT NOT NULL DEFAULT 0,
  delivered_count INT NOT NULL DEFAULT 0,
  read_count INT NOT NULL DEFAULT 0,
  replied_count INT NOT NULL DEFAULT 0,
  failed_count INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY broadcasts_account_status_idx (account_id, status, scheduled_at),
  CONSTRAINT broadcasts_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT broadcasts_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS broadcast_recipients (
  id CHAR(36) NOT NULL,
  broadcast_id CHAR(36) NOT NULL,
  contact_id CHAR(36) NULL,
  whatsapp_message_id VARCHAR(255) NULL,
  status ENUM('pending', 'sent', 'delivered', 'read', 'replied', 'failed')
    NOT NULL DEFAULT 'pending',
  sent_at DATETIME(3) NULL,
  delivered_at DATETIME(3) NULL,
  read_at DATETIME(3) NULL,
  replied_at DATETIME(3) NULL,
  error_message TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY broadcast_recipients_whatsapp_message_id_unique
    (whatsapp_message_id),
  KEY broadcast_recipients_broadcast_status_idx (broadcast_id, status),
  CONSTRAINT broadcast_recipients_broadcast_id_fk
    FOREIGN KEY (broadcast_id) REFERENCES broadcasts(id) ON DELETE CASCADE,
  CONSTRAINT broadcast_recipients_contact_id_fk
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS quick_replies (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  kind ENUM('text', 'interactive') NOT NULL DEFAULT 'text',
  content_text TEXT NULL,
  interactive_payload JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY quick_replies_account_id_idx (account_id),
  CONSTRAINT quick_replies_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT quick_replies_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


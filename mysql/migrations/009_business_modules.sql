CREATE TABLE IF NOT EXISTS client_activity_events (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  contact_id CHAR(36) NOT NULL,
  event_type ENUM(
    'profile_updated', 'tag_added', 'tag_removed', 'note_added',
    'note_removed', 'custom_field_updated'
  ) NOT NULL,
  title VARCHAR(255) NOT NULL,
  detail TEXT NULL,
  actor_user_id CHAR(36) NULL,
  metadata JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY client_activity_account_contact_idx (account_id, contact_id, created_at),
  CONSTRAINT client_activity_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT client_activity_contact_id_fk
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  CONSTRAINT client_activity_actor_user_id_fk
    FOREIGN KEY (actor_user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS client_portal_settings (
  account_id CHAR(36) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  booking_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  benefits_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  financial_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  profile_edit_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  referrals_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  welcome_title VARCHAR(255) NOT NULL DEFAULT 'A sua experiência, num só lugar',
  welcome_message TEXT NULL,
  cancellation_hours INT NOT NULL DEFAULT 24,
  booking_advance_days INT NOT NULL DEFAULT 90,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (account_id),
  UNIQUE KEY client_portal_settings_slug_unique (slug),
  CONSTRAINT client_portal_settings_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT client_portal_cancellation_hours_check
    CHECK (cancellation_hours BETWEEN 0 AND 720),
  CONSTRAINT client_portal_booking_advance_check
    CHECK (booking_advance_days BETWEEN 1 AND 730)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS client_portal_access (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  contact_id CHAR(36) NOT NULL,
  auth_user_id CHAR(36) NOT NULL,
  email VARCHAR(320) NOT NULL,
  last_login_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY client_portal_access_contact_unique (account_id, contact_id),
  UNIQUE KEY client_portal_access_user_unique (account_id, auth_user_id),
  CONSTRAINT client_portal_access_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT client_portal_access_contact_id_fk
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  CONSTRAINT client_portal_access_auth_user_id_fk
    FOREIGN KEY (auth_user_id) REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_tickets (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  contact_id CHAR(36) NULL,
  created_by CHAR(36) NULL,
  number BIGINT NOT NULL AUTO_INCREMENT,
  subject VARCHAR(160) NOT NULL,
  category VARCHAR(100) NOT NULL DEFAULT 'general',
  priority ENUM('low', 'normal', 'high', 'urgent') NOT NULL DEFAULT 'normal',
  status ENUM('open', 'in_progress', 'waiting_customer', 'resolved', 'closed')
    NOT NULL DEFAULT 'open',
  source ENUM('backoffice', 'portal') NOT NULL DEFAULT 'backoffice',
  assigned_to CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  resolved_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY support_tickets_number_unique (number),
  KEY support_tickets_account_status_idx (account_id, status, updated_at),
  CONSTRAINT support_tickets_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT support_tickets_contact_id_fk
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  CONSTRAINT support_tickets_created_by_fk
    FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL,
  CONSTRAINT support_tickets_assigned_to_fk
    FOREIGN KEY (assigned_to) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT support_tickets_subject_check CHECK (CHAR_LENGTH(subject) BETWEEN 3 AND 160)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS support_ticket_messages (
  id CHAR(36) NOT NULL,
  ticket_id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  author_type ENUM('staff', 'client') NOT NULL,
  author_user_id CHAR(36) NULL,
  contact_id CHAR(36) NULL,
  body TEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY support_ticket_messages_ticket_idx (ticket_id, created_at),
  CONSTRAINT support_ticket_messages_ticket_id_fk
    FOREIGN KEY (ticket_id) REFERENCES support_tickets(id) ON DELETE CASCADE,
  CONSTRAINT support_ticket_messages_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT support_ticket_messages_author_user_id_fk
    FOREIGN KEY (author_user_id) REFERENCES app_users(id) ON DELETE SET NULL,
  CONSTRAINT support_ticket_messages_contact_id_fk
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  CONSTRAINT support_ticket_messages_body_check CHECK (CHAR_LENGTH(body) BETWEEN 1 AND 5000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portal_notifications (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  contact_id CHAR(36) NOT NULL,
  type VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  body TEXT NULL,
  action_tab VARCHAR(100) NULL,
  metadata JSON NOT NULL,
  read_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY portal_notifications_contact_created_idx (contact_id, created_at),
  CONSTRAINT portal_notifications_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT portal_notifications_contact_id_fk
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS public_site_settings (
  account_id CHAR(36) NOT NULL,
  slug VARCHAR(60) NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  site_theme ENUM('wellness', 'clinic', 'luxury', 'corporate', 'vibrant', 'minimal')
    NOT NULL DEFAULT 'wellness',
  primary_color VARCHAR(20) NOT NULL DEFAULT '#2563eb',
  accent_color VARCHAR(20) NOT NULL DEFAULT '#0f172a',
  hero_badge VARCHAR(255) NULL,
  hero_title VARCHAR(255) NOT NULL DEFAULT 'Cuidado, qualidade e confiança',
  hero_subtitle TEXT NULL,
  hero_image_url TEXT NULL,
  about_title VARCHAR(255) NOT NULL DEFAULT 'Sobre nós',
  about_text TEXT NULL,
  history_text TEXT NULL,
  mission_text TEXT NULL,
  contact_email VARCHAR(320) NULL,
  contact_phone VARCHAR(50) NULL,
  whatsapp_phone VARCHAR(50) NULL,
  address TEXT NULL,
  opening_hours TEXT NULL,
  instagram_url TEXT NULL,
  facebook_url TEXT NULL,
  linkedin_url TEXT NULL,
  show_services BOOLEAN NOT NULL DEFAULT TRUE,
  show_team BOOLEAN NOT NULL DEFAULT TRUE,
  show_plans BOOLEAN NOT NULL DEFAULT TRUE,
  show_benefits BOOLEAN NOT NULL DEFAULT TRUE,
  show_testimonials BOOLEAN NOT NULL DEFAULT TRUE,
  show_faq BOOLEAN NOT NULL DEFAULT TRUE,
  show_booking BOOLEAN NOT NULL DEFAULT TRUE,
  plans JSON NOT NULL,
  benefits JSON NOT NULL,
  testimonials JSON NOT NULL,
  faqs JSON NOT NULL,
  seo_title VARCHAR(255) NULL,
  seo_description TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (account_id),
  UNIQUE KEY public_site_settings_slug_unique (slug),
  CONSTRAINT public_site_settings_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT public_site_settings_slug_check
    CHECK (slug REGEXP '^[a-z0-9]+(-[a-z0-9]+)*$' AND CHAR_LENGTH(slug) BETWEEN 3 AND 60)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS public_site_leads (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  contact_id CHAR(36) NULL,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(320) NULL,
  phone VARCHAR(40) NOT NULL,
  subject VARCHAR(255) NULL,
  message TEXT NOT NULL,
  status ENUM('new', 'contacted', 'qualified', 'closed', 'spam') NOT NULL DEFAULT 'new',
  source_slug VARCHAR(60) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY public_site_leads_account_status_idx (account_id, status, created_at),
  CONSTRAINT public_site_leads_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT public_site_leads_contact_id_fk
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS scheduled_whatsapp_messages (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  user_id CHAR(36) NULL,
  contact_id CHAR(36) NOT NULL,
  conversation_id CHAR(36) NULL,
  message_type ENUM('text') NOT NULL DEFAULT 'text',
  content_text TEXT NOT NULL,
  scheduled_at DATETIME(3) NOT NULL,
  status ENUM('scheduled', 'sending', 'sent', 'failed', 'cancelled')
    NOT NULL DEFAULT 'scheduled',
  attempts INT NOT NULL DEFAULT 0,
  last_error TEXT NULL,
  sent_message_id CHAR(36) NULL,
  whatsapp_message_id VARCHAR(255) NULL,
  sent_at DATETIME(3) NULL,
  cancelled_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY scheduled_whatsapp_due_idx (status, scheduled_at),
  CONSTRAINT scheduled_whatsapp_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT scheduled_whatsapp_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE SET NULL,
  CONSTRAINT scheduled_whatsapp_contact_id_fk
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  CONSTRAINT scheduled_whatsapp_conversation_id_fk
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
  CONSTRAINT scheduled_whatsapp_sent_message_id_fk
    FOREIGN KEY (sent_message_id) REFERENCES messages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS crm_tasks (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  user_id CHAR(36) NULL,
  contact_id CHAR(36) NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NULL,
  due_at DATETIME(3) NULL,
  priority ENUM('low', 'normal', 'high', 'urgent') NOT NULL DEFAULT 'normal',
  status ENUM('open', 'completed', 'cancelled') NOT NULL DEFAULT 'open',
  completed_at DATETIME(3) NULL,
  cancelled_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY crm_tasks_account_status_due_idx (account_id, status, due_at),
  CONSTRAINT crm_tasks_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT crm_tasks_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE SET NULL,
  CONSTRAINT crm_tasks_contact_id_fk
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS message_library_items (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  user_id CHAR(36) NULL,
  title VARCHAR(255) NOT NULL,
  category VARCHAR(150) NOT NULL DEFAULT 'Geral',
  item_type ENUM('text', 'link', 'image', 'video', 'document', 'audio')
    NOT NULL DEFAULT 'text',
  content_text TEXT NULL,
  asset_url TEXT NULL,
  caption TEXT NULL,
  tags JSON NOT NULL,
  is_favorite BOOLEAN NOT NULL DEFAULT FALSE,
  usage_count INT NOT NULL DEFAULT 0,
  last_used_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY message_library_account_category_idx (account_id, category),
  CONSTRAINT message_library_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT message_library_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS contact_segments (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  user_id CHAR(36) NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  config JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY contact_segments_account_id_idx (account_id),
  CONSTRAINT contact_segments_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT contact_segments_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marketing_automation_rules (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  user_id CHAR(36) NULL,
  name VARCHAR(255) NOT NULL,
  trigger_type ENUM('birthday', 'inactivity') NOT NULL,
  days_before INT NOT NULL DEFAULT 0,
  inactivity_days INT NOT NULL DEFAULT 30,
  send_time TIME NOT NULL DEFAULT '09:00:00',
  message_text TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_run_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY marketing_rules_account_active_idx (account_id, is_active, trigger_type),
  CONSTRAINT marketing_rules_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT marketing_rules_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE SET NULL,
  CONSTRAINT marketing_rules_days_before_check CHECK (days_before BETWEEN 0 AND 30),
  CONSTRAINT marketing_rules_inactivity_check CHECK (inactivity_days BETWEEN 1 AND 730)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS marketing_automation_dispatch_log (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  rule_id CHAR(36) NOT NULL,
  contact_id CHAR(36) NOT NULL,
  run_key VARCHAR(255) NOT NULL,
  scheduled_message_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY marketing_dispatch_rule_contact_run_unique (rule_id, contact_id, run_key),
  CONSTRAINT marketing_dispatch_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT marketing_dispatch_rule_id_fk
    FOREIGN KEY (rule_id) REFERENCES marketing_automation_rules(id) ON DELETE CASCADE,
  CONSTRAINT marketing_dispatch_contact_id_fk
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  CONSTRAINT marketing_dispatch_scheduled_message_id_fk
    FOREIGN KEY (scheduled_message_id) REFERENCES scheduled_whatsapp_messages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS business_integration_settings (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  category ENUM('fiscal', 'payments', 'ads', 'email', 'booking_ai') NOT NULL,
  provider VARCHAR(150) NOT NULL,
  status ENUM('not_configured', 'configured', 'active', 'paused', 'error')
    NOT NULL DEFAULT 'not_configured',
  display_name VARCHAR(255) NOT NULL,
  config JSON NOT NULL,
  last_error TEXT NULL,
  connected_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY business_integrations_account_category_provider_unique
    (account_id, category, provider),
  CONSTRAINT business_integrations_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portal_campaigns (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  title VARCHAR(255) NOT NULL,
  summary TEXT NOT NULL,
  description LONGTEXT NOT NULL,
  image_url TEXT NULL,
  badge_text VARCHAR(255) NULL,
  benefit_text TEXT NULL,
  terms TEXT NULL,
  starts_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ends_at DATETIME(3) NULL,
  capacity INT NULL,
  status ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
  created_by CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY portal_campaigns_account_status_idx (account_id, status, starts_at),
  CONSTRAINT portal_campaigns_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT portal_campaigns_created_by_fk
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT portal_campaigns_capacity_check CHECK (capacity IS NULL OR capacity > 0),
  CONSTRAINT portal_campaigns_dates_check CHECK (ends_at IS NULL OR ends_at > starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS portal_campaign_enrollments (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  campaign_id CHAR(36) NOT NULL,
  contact_id CHAR(36) NOT NULL,
  status ENUM('joined', 'contacted', 'converted', 'cancelled') NOT NULL DEFAULT 'joined',
  joined_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  notes TEXT NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY portal_campaign_enrollments_campaign_contact_unique
    (campaign_id, contact_id),
  CONSTRAINT portal_campaign_enrollments_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT portal_campaign_enrollments_campaign_id_fk
    FOREIGN KEY (campaign_id) REFERENCES portal_campaigns(id) ON DELETE CASCADE,
  CONSTRAINT portal_campaign_enrollments_contact_id_fk
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS social_scheduled_posts (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  created_by CHAR(36) NULL,
  platform ENUM('instagram', 'whatsapp') NOT NULL,
  post_type ENUM(
    'instagram_feed', 'instagram_reel', 'instagram_story',
    'whatsapp_campaign', 'whatsapp_status_reminder'
  ) NOT NULL,
  status ENUM('draft', 'scheduled', 'ready', 'publishing', 'published', 'failed', 'cancelled')
    NOT NULL DEFAULT 'draft',
  title VARCHAR(255) NOT NULL,
  caption LONGTEXT NOT NULL,
  media_url TEXT NULL,
  cover_url TEXT NULL,
  hashtags JSON NOT NULL,
  scheduled_at DATETIME(3) NULL,
  published_at DATETIME(3) NULL,
  target_segment_id CHAR(36) NULL,
  provider_post_id VARCHAR(255) NULL,
  provider_payload JSON NOT NULL,
  last_error TEXT NULL,
  notes TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY social_posts_account_status_idx (account_id, status, scheduled_at),
  KEY social_posts_account_platform_idx (account_id, platform, scheduled_at),
  CONSTRAINT social_posts_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT social_posts_created_by_fk
    FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL,
  CONSTRAINT social_posts_target_segment_id_fk
    FOREIGN KEY (target_segment_id) REFERENCES contact_segments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


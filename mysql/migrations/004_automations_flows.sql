CREATE TABLE IF NOT EXISTS automations (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  trigger_type VARCHAR(100) NOT NULL,
  trigger_config JSON NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  execution_count INT NOT NULL DEFAULT 0,
  last_executed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY automations_account_active_trigger_idx
    (account_id, is_active, trigger_type),
  CONSTRAINT automations_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT automations_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS automation_steps (
  id CHAR(36) NOT NULL,
  automation_id CHAR(36) NOT NULL,
  parent_step_id CHAR(36) NULL,
  branch ENUM('yes', 'no') NULL,
  step_type VARCHAR(100) NOT NULL,
  step_config JSON NOT NULL,
  position INT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY automation_steps_automation_position_idx (automation_id, position),
  KEY automation_steps_parent_idx (parent_step_id),
  CONSTRAINT automation_steps_automation_id_fk
    FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE,
  CONSTRAINT automation_steps_parent_step_id_fk
    FOREIGN KEY (parent_step_id) REFERENCES automation_steps(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS automation_logs (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  automation_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  contact_id CHAR(36) NULL,
  trigger_event VARCHAR(255) NOT NULL,
  steps_executed JSON NOT NULL,
  status ENUM('success', 'partial', 'failed') NOT NULL,
  error_message TEXT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY automation_logs_account_created_idx (account_id, created_at),
  KEY automation_logs_automation_created_idx (automation_id, created_at),
  CONSTRAINT automation_logs_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT automation_logs_automation_id_fk
    FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE,
  CONSTRAINT automation_logs_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
  CONSTRAINT automation_logs_contact_id_fk
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS automation_pending_executions (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  automation_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  contact_id CHAR(36) NULL,
  log_id CHAR(36) NULL,
  parent_step_id CHAR(36) NULL,
  branch ENUM('yes', 'no') NULL,
  next_step_position INT NOT NULL,
  context JSON NOT NULL,
  status ENUM('pending', 'running', 'done', 'failed') NOT NULL DEFAULT 'pending',
  run_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY automation_pending_due_idx (status, run_at),
  KEY automation_pending_account_idx (account_id),
  CONSTRAINT automation_pending_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT automation_pending_automation_id_fk
    FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE,
  CONSTRAINT automation_pending_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
  CONSTRAINT automation_pending_contact_id_fk
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  CONSTRAINT automation_pending_log_id_fk
    FOREIGN KEY (log_id) REFERENCES automation_logs(id) ON DELETE CASCADE,
  CONSTRAINT automation_pending_parent_step_id_fk
    FOREIGN KEY (parent_step_id) REFERENCES automation_steps(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS flows (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  status ENUM('draft', 'active', 'archived') NOT NULL DEFAULT 'draft',
  trigger_type ENUM('keyword', 'first_inbound_message', 'manual') NOT NULL,
  trigger_config JSON NOT NULL,
  entry_node_id VARCHAR(255) NULL,
  fallback_policy JSON NOT NULL,
  execution_count INT NOT NULL DEFAULT 0,
  last_executed_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY flows_account_status_trigger_idx (account_id, status, trigger_type),
  CONSTRAINT flows_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT flows_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS flow_nodes (
  id CHAR(36) NOT NULL,
  flow_id CHAR(36) NOT NULL,
  node_key VARCHAR(255) NOT NULL,
  node_type ENUM(
    'start', 'send_buttons', 'send_list', 'send_message', 'collect_input',
    'condition', 'set_tag', 'handoff', 'http_fetch', 'end'
  ) NOT NULL,
  config JSON NOT NULL,
  position_x INT NOT NULL DEFAULT 0,
  position_y INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY flow_nodes_flow_key_unique (flow_id, node_key),
  CONSTRAINT flow_nodes_flow_id_fk
    FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS flow_runs (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  flow_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  contact_id CHAR(36) NULL,
  conversation_id CHAR(36) NULL,
  status ENUM(
    'active', 'completed', 'handed_off', 'timed_out', 'paused_by_agent', 'failed'
  ) NOT NULL DEFAULT 'active',
  current_node_key VARCHAR(255) NULL,
  last_prompt_message_id CHAR(36) NULL,
  vars JSON NOT NULL,
  reprompt_count INT NOT NULL DEFAULT 0,
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_advanced_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ended_at DATETIME(3) NULL,
  end_reason TEXT NULL,
  PRIMARY KEY (id),
  KEY flow_runs_active_contact_idx (account_id, contact_id, status),
  KEY flow_runs_account_active_idx (account_id, status, last_advanced_at),
  KEY flow_runs_flow_started_idx (flow_id, started_at),
  CONSTRAINT flow_runs_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT flow_runs_flow_id_fk
    FOREIGN KEY (flow_id) REFERENCES flows(id) ON DELETE CASCADE,
  CONSTRAINT flow_runs_user_id_fk
    FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE,
  CONSTRAINT flow_runs_contact_id_fk
    FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  CONSTRAINT flow_runs_conversation_id_fk
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL,
  CONSTRAINT flow_runs_last_prompt_message_id_fk
    FOREIGN KEY (last_prompt_message_id) REFERENCES messages(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS flow_run_events (
  id CHAR(36) NOT NULL,
  flow_run_id CHAR(36) NOT NULL,
  event_type ENUM(
    'started', 'node_entered', 'message_sent', 'reply_received',
    'fallback_fired', 'handoff', 'timeout', 'error', 'completed'
  ) NOT NULL,
  node_key VARCHAR(255) NULL,
  payload JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY flow_run_events_run_type_idx (flow_run_id, event_type),
  KEY flow_run_events_run_time_idx (flow_run_id, created_at),
  CONSTRAINT flow_run_events_flow_run_id_fk
    FOREIGN KEY (flow_run_id) REFERENCES flow_runs(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

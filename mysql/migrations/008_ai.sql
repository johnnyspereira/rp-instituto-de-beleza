CREATE TABLE IF NOT EXISTS ai_configs (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  created_by CHAR(36) NULL,
  provider ENUM('openai', 'anthropic') NOT NULL,
  model VARCHAR(255) NOT NULL,
  api_key TEXT NOT NULL,
  system_prompt LONGTEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  auto_reply_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  auto_reply_max_per_conversation INT NOT NULL DEFAULT 3,
  handoff_agent_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY ai_configs_account_id_unique (account_id),
  CONSTRAINT ai_configs_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT ai_configs_created_by_fk
    FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL,
  CONSTRAINT ai_configs_handoff_agent_id_fk
    FOREIGN KEY (handoff_agent_id) REFERENCES app_users(id) ON DELETE SET NULL,
  CONSTRAINT ai_configs_max_replies_check
    CHECK (auto_reply_max_per_conversation BETWEEN 1 AND 20)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_knowledge_documents (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  created_by CHAR(36) NULL,
  title VARCHAR(255) NOT NULL,
  content LONGTEXT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ai_knowledge_documents_account_id_idx (account_id),
  FULLTEXT KEY ai_knowledge_documents_content_fts (title, content),
  CONSTRAINT ai_knowledge_documents_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT ai_knowledge_documents_created_by_fk
    FOREIGN KEY (created_by) REFERENCES app_users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_knowledge_chunks (
  id CHAR(36) NOT NULL,
  document_id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  chunk_index INT NOT NULL DEFAULT 0,
  content LONGTEXT NOT NULL,
  embedding JSON NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY ai_knowledge_chunks_document_index_unique
    (document_id, chunk_index),
  KEY ai_knowledge_chunks_account_id_idx (account_id),
  FULLTEXT KEY ai_knowledge_chunks_content_fts (content),
  CONSTRAINT ai_knowledge_chunks_document_id_fk
    FOREIGN KEY (document_id) REFERENCES ai_knowledge_documents(id) ON DELETE CASCADE,
  CONSTRAINT ai_knowledge_chunks_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS ai_usage_log (
  id CHAR(36) NOT NULL,
  account_id CHAR(36) NOT NULL,
  conversation_id CHAR(36) NULL,
  mode ENUM('auto_reply', 'draft') NOT NULL,
  provider ENUM('openai', 'anthropic') NOT NULL,
  model VARCHAR(255) NOT NULL,
  prompt_tokens INT NOT NULL DEFAULT 0,
  completion_tokens INT NOT NULL DEFAULT 0,
  total_tokens INT NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY ai_usage_log_account_created_idx (account_id, created_at),
  CONSTRAINT ai_usage_log_account_id_fk
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
  CONSTRAINT ai_usage_log_conversation_id_fk
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


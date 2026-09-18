-- Adds the two supported AI providers without changing existing setups.
ALTER TABLE ai_configs
  MODIFY COLUMN provider ENUM('openai', 'anthropic', 'gemini', 'ollama') NOT NULL;

ALTER TABLE ai_usage_log
  MODIFY COLUMN provider ENUM('openai', 'anthropic', 'gemini', 'ollama') NOT NULL;

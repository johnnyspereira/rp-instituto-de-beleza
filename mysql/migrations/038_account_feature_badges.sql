-- Feature callouts are a workspace preference, not a browser preference.
-- Keep them off by default so a newly migrated account is not overwhelmed
-- by promotional labels in the primary navigation.
ALTER TABLE accounts
  ADD COLUMN new_feature_badges_enabled BOOLEAN NOT NULL DEFAULT FALSE
  AFTER logo_url;

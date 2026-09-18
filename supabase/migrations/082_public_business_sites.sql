-- Multi-tenant public business websites and CRM-native lead capture.
CREATE TABLE IF NOT EXISTS public_site_settings (
  account_id UUID PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' AND char_length(slug) BETWEEN 3 AND 60),
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  primary_color TEXT NOT NULL DEFAULT '#2563eb',
  accent_color TEXT NOT NULL DEFAULT '#0f172a',
  hero_badge TEXT,
  hero_title TEXT NOT NULL DEFAULT 'Cuidado, qualidade e confiança',
  hero_subtitle TEXT,
  hero_image_url TEXT,
  about_title TEXT NOT NULL DEFAULT 'Sobre nós',
  about_text TEXT,
  history_text TEXT,
  mission_text TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  whatsapp_phone TEXT,
  address TEXT,
  opening_hours TEXT,
  instagram_url TEXT,
  facebook_url TEXT,
  linkedin_url TEXT,
  show_services BOOLEAN NOT NULL DEFAULT TRUE,
  show_team BOOLEAN NOT NULL DEFAULT TRUE,
  show_plans BOOLEAN NOT NULL DEFAULT TRUE,
  show_benefits BOOLEAN NOT NULL DEFAULT TRUE,
  show_testimonials BOOLEAN NOT NULL DEFAULT TRUE,
  show_faq BOOLEAN NOT NULL DEFAULT TRUE,
  show_booking BOOLEAN NOT NULL DEFAULT TRUE,
  plans JSONB NOT NULL DEFAULT '[]'::jsonb,
  benefits JSONB NOT NULL DEFAULT '[]'::jsonb,
  testimonials JSONB NOT NULL DEFAULT '[]'::jsonb,
  faqs JSONB NOT NULL DEFAULT '[]'::jsonb,
  seo_title TEXT,
  seo_description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public_site_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  name TEXT NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  email TEXT,
  phone TEXT NOT NULL CHECK (char_length(phone) BETWEEN 6 AND 40),
  subject TEXT,
  message TEXT NOT NULL CHECK (char_length(message) BETWEEN 3 AND 3000),
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new','contacted','qualified','closed','spam')),
  source_slug TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS public_site_leads_account_created_idx ON public_site_leads(account_id,created_at DESC);

ALTER TABLE public_site_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_site_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY public_site_settings_staff_read ON public_site_settings FOR SELECT USING (is_account_member(account_id));
CREATE POLICY public_site_settings_admin_manage ON public_site_settings FOR ALL USING (is_account_member(account_id,'admin')) WITH CHECK (is_account_member(account_id,'admin'));
CREATE POLICY public_site_leads_staff_read ON public_site_leads FOR SELECT USING (is_account_member(account_id));
CREATE POLICY public_site_leads_staff_update ON public_site_leads FOR UPDATE USING (is_account_member(account_id,'agent')) WITH CHECK (is_account_member(account_id,'agent'));

DROP TRIGGER IF EXISTS public_site_settings_updated_at ON public_site_settings;
CREATE TRIGGER public_site_settings_updated_at BEFORE UPDATE ON public_site_settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS public_site_leads_updated_at ON public_site_leads;
CREATE TRIGGER public_site_leads_updated_at BEFORE UPDATE ON public_site_leads FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE OR REPLACE FUNCTION public_site_lead_to_contact() RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_owner UUID; v_contact UUID;
BEGIN
  SELECT id INTO v_contact FROM contacts WHERE account_id=NEW.account_id AND phone=NEW.phone LIMIT 1;
  IF v_contact IS NULL THEN
    SELECT user_id INTO v_owner FROM profiles WHERE account_id=NEW.account_id AND account_role='owner' AND user_id IS NOT NULL LIMIT 1;
    IF v_owner IS NOT NULL THEN
      INSERT INTO contacts(user_id,account_id,phone,name,email,source)
      VALUES(v_owner,NEW.account_id,NEW.phone,NEW.name,NULLIF(NEW.email,''),'public_website') RETURNING id INTO v_contact;
    END IF;
  ELSE
    UPDATE contacts SET name=COALESCE(NULLIF(contacts.name,''),NEW.name),email=COALESCE(NULLIF(contacts.email,''),NULLIF(NEW.email,'')),updated_at=now() WHERE id=v_contact;
  END IF;
  UPDATE public_site_leads SET contact_id=v_contact WHERE id=NEW.id;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN RAISE WARNING 'Public website lead conversion failed: %',SQLERRM; RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS public_site_lead_to_contact_trigger ON public_site_leads;
CREATE TRIGGER public_site_lead_to_contact_trigger AFTER INSERT ON public_site_leads FOR EACH ROW EXECUTE FUNCTION public_site_lead_to_contact();

NOTIFY pgrst,'reload schema';

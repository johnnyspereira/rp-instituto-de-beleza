ALTER TABLE clinic_services
  ADD COLUMN public_presentation TEXT NULL AFTER description,
  ADD COLUMN public_benefits JSON NULL AFTER public_presentation,
  ADD COLUMN public_considerations JSON NULL AFTER public_benefits,
  ADD COLUMN public_image_url VARCHAR(2048) NULL AFTER public_considerations;

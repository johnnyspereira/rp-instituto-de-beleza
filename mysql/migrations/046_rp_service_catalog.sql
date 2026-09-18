-- RP catalogue from supplied price lists, effective 01/01/2025.
-- 60 minutes is a provisional agenda slot, not a published treatment duration.
-- Online booking remains disabled until RP validates durations and prices.

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Extensão de pestanas — 1.ª aplicação', 'RP-001', 'Rosto e pestanas', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 35, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-001' OR LOWER(TRIM(s.name))=LOWER('Extensão de pestanas — 1.ª aplicação')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Extensão de pestanas — manutenção', 'RP-002', 'Rosto e pestanas', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 25, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-002' OR LOWER(TRIM(s.name))=LOWER('Extensão de pestanas — manutenção')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Extensão de pestanas — remoção', 'RP-003', 'Rosto e pestanas', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 10, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-003' OR LOWER(TRIM(s.name))=LOWER('Extensão de pestanas — remoção')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Lifting de pestanas — aplicação', 'RP-004', 'Rosto e pestanas', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 35, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-004' OR LOWER(TRIM(s.name))=LOWER('Lifting de pestanas — aplicação')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Pintura de pestanas', 'RP-005', 'Rosto e pestanas', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 8, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-005' OR LOWER(TRIM(s.name))=LOWER('Pintura de pestanas')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Micropigmentação de sobrancelhas — aplicação', 'RP-006', 'Rosto e pestanas', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 180, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-006' OR LOWER(TRIM(s.name))=LOWER('Micropigmentação de sobrancelhas — aplicação')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Micropigmentação de sobrancelhas — retoque', 'RP-007', 'Rosto e pestanas', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 60, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-007' OR LOWER(TRIM(s.name))=LOWER('Micropigmentação de sobrancelhas — retoque')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Limpeza de pele', 'RP-008', 'Rosto e pestanas', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 35, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-008' OR LOWER(TRIM(s.name))=LOWER('Limpeza de pele')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Threading — sobrancelhas', 'RP-009', 'Rosto e pestanas', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 5, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-009' OR LOWER(TRIM(s.name))=LOWER('Threading — sobrancelhas')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Threading — buço', 'RP-010', 'Rosto e pestanas', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 5, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-010' OR LOWER(TRIM(s.name))=LOWER('Threading — buço')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Threading — rosto', 'RP-011', 'Rosto e pestanas', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 15, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-011' OR LOWER(TRIM(s.name))=LOWER('Threading — rosto')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Henna e design de sobrancelha', 'RP-012', 'Rosto e pestanas', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 10, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-012' OR LOWER(TRIM(s.name))=LOWER('Henna e design de sobrancelha')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Unhas de gel — 1.ª aplicação S/M', 'RP-013', 'Unhas', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 30, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-013' OR LOWER(TRIM(s.name))=LOWER('Unhas de gel — 1.ª aplicação S/M')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Unhas de acrílico — 1.ª aplicação S/M', 'RP-014', 'Unhas', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 35, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-014' OR LOWER(TRIM(s.name))=LOWER('Unhas de acrílico — 1.ª aplicação S/M')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Unhas de gel — 1.ª aplicação L/XL', 'RP-015', 'Unhas', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 35, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-015' OR LOWER(TRIM(s.name))=LOWER('Unhas de gel — 1.ª aplicação L/XL')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Unhas de acrílico — 1.ª aplicação L/XL', 'RP-016', 'Unhas', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 39, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-016' OR LOWER(TRIM(s.name))=LOWER('Unhas de acrílico — 1.ª aplicação L/XL')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Unhas de gel — 1.ª aplicação XXL', 'RP-017', 'Unhas', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 39, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-017' OR LOWER(TRIM(s.name))=LOWER('Unhas de gel — 1.ª aplicação XXL')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Unhas de acrílico — 1.ª aplicação XXL', 'RP-018', 'Unhas', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 45, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-018' OR LOWER(TRIM(s.name))=LOWER('Unhas de acrílico — 1.ª aplicação XXL')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Unhas de gel — Manutenção S/M', 'RP-019', 'Unhas', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 20, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-019' OR LOWER(TRIM(s.name))=LOWER('Unhas de gel — Manutenção S/M')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Unhas de acrílico — Manutenção S/M', 'RP-020', 'Unhas', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 29, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-020' OR LOWER(TRIM(s.name))=LOWER('Unhas de acrílico — Manutenção S/M')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Unhas de gel — Manutenção L/XL', 'RP-021', 'Unhas', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 25, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-021' OR LOWER(TRIM(s.name))=LOWER('Unhas de gel — Manutenção L/XL')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Unhas de acrílico — Manutenção L/XL', 'RP-022', 'Unhas', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 33, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-022' OR LOWER(TRIM(s.name))=LOWER('Unhas de acrílico — Manutenção L/XL')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Unhas de gel — Manutenção XXL', 'RP-023', 'Unhas', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 30, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-023' OR LOWER(TRIM(s.name))=LOWER('Unhas de gel — Manutenção XXL')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Unhas de acrílico — Manutenção XXL', 'RP-024', 'Unhas', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 38, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-024' OR LOWER(TRIM(s.name))=LOWER('Unhas de acrílico — Manutenção XXL')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Unhas de gel — Remoção', 'RP-025', 'Unhas', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 10, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-025' OR LOWER(TRIM(s.name))=LOWER('Unhas de gel — Remoção')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Unhas de acrílico — Remoção', 'RP-026', 'Unhas', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 12, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-026' OR LOWER(TRIM(s.name))=LOWER('Unhas de acrílico — Remoção')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Gelinho', 'RP-027', 'Unhas', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 16.5, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-027' OR LOWER(TRIM(s.name))=LOWER('Gelinho')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Gelinho — pés', 'RP-028', 'Unhas', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 13, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-028' OR LOWER(TRIM(s.name))=LOWER('Gelinho — pés')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a laser díodo — mulher — Buço ou queixo', 'RP-029', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 10, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-029' OR LOWER(TRIM(s.name))=LOWER('Depilação a laser díodo — mulher — Buço ou queixo')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a cera — mulher — Buço ou queixo', 'RP-030', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 5, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-030' OR LOWER(TRIM(s.name))=LOWER('Depilação a cera — mulher — Buço ou queixo')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a laser díodo — mulher — Rosto (buço, queixo e bochechas)', 'RP-031', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 20, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-031' OR LOWER(TRIM(s.name))=LOWER('Depilação a laser díodo — mulher — Rosto (buço, queixo e bochechas)')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a cera — mulher — Rosto (buço, queixo e bochechas)', 'RP-032', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 13, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-032' OR LOWER(TRIM(s.name))=LOWER('Depilação a cera — mulher — Rosto (buço, queixo e bochechas)')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a laser díodo — mulher — Axilas', 'RP-033', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 20, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-033' OR LOWER(TRIM(s.name))=LOWER('Depilação a laser díodo — mulher — Axilas')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a cera — mulher — Axilas', 'RP-034', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 10, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-034' OR LOWER(TRIM(s.name))=LOWER('Depilação a cera — mulher — Axilas')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a laser díodo — homem — Axilas', 'RP-035', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 25, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-035' OR LOWER(TRIM(s.name))=LOWER('Depilação a laser díodo — homem — Axilas')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a cera — homem — Axilas', 'RP-036', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 10, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-036' OR LOWER(TRIM(s.name))=LOWER('Depilação a cera — homem — Axilas')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a laser díodo — mulher — Braços', 'RP-037', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 20, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-037' OR LOWER(TRIM(s.name))=LOWER('Depilação a laser díodo — mulher — Braços')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a cera — mulher — Braços', 'RP-038', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 5, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-038' OR LOWER(TRIM(s.name))=LOWER('Depilação a cera — mulher — Braços')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a laser díodo — homem — Braços', 'RP-039', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 25, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-039' OR LOWER(TRIM(s.name))=LOWER('Depilação a laser díodo — homem — Braços')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a cera — homem — Braços', 'RP-040', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 15, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-040' OR LOWER(TRIM(s.name))=LOWER('Depilação a cera — homem — Braços')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a laser díodo — mulher — Mãos', 'RP-041', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 10, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-041' OR LOWER(TRIM(s.name))=LOWER('Depilação a laser díodo — mulher — Mãos')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a cera — mulher — Mãos', 'RP-042', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 5, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-042' OR LOWER(TRIM(s.name))=LOWER('Depilação a cera — mulher — Mãos')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a laser díodo — homem — Mãos', 'RP-043', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 15, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-043' OR LOWER(TRIM(s.name))=LOWER('Depilação a laser díodo — homem — Mãos')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a cera — homem — Mãos', 'RP-044', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 8, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-044' OR LOWER(TRIM(s.name))=LOWER('Depilação a cera — homem — Mãos')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a laser díodo — mulher — Barriga', 'RP-045', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 20, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-045' OR LOWER(TRIM(s.name))=LOWER('Depilação a laser díodo — mulher — Barriga')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a cera — mulher — Barriga', 'RP-046', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 13, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-046' OR LOWER(TRIM(s.name))=LOWER('Depilação a cera — mulher — Barriga')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a laser díodo — homem — Barriga', 'RP-047', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 25, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-047' OR LOWER(TRIM(s.name))=LOWER('Depilação a laser díodo — homem — Barriga')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a cera — homem — Barriga', 'RP-048', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 15, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-048' OR LOWER(TRIM(s.name))=LOWER('Depilação a cera — homem — Barriga')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a laser díodo — homem — Peito', 'RP-049', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 25, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-049' OR LOWER(TRIM(s.name))=LOWER('Depilação a laser díodo — homem — Peito')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a cera — homem — Peito', 'RP-050', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 12, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-050' OR LOWER(TRIM(s.name))=LOWER('Depilação a cera — homem — Peito')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a laser díodo — mulher — Costas', 'RP-051', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 20, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-051' OR LOWER(TRIM(s.name))=LOWER('Depilação a laser díodo — mulher — Costas')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a cera — mulher — Costas', 'RP-052', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 13, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-052' OR LOWER(TRIM(s.name))=LOWER('Depilação a cera — mulher — Costas')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a laser díodo — homem — Costas', 'RP-053', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 25, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-053' OR LOWER(TRIM(s.name))=LOWER('Depilação a laser díodo — homem — Costas')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a cera — homem — Costas', 'RP-054', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 15, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-054' OR LOWER(TRIM(s.name))=LOWER('Depilação a cera — homem — Costas')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a laser díodo — mulher — Virilha cavada', 'RP-055', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 15, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-055' OR LOWER(TRIM(s.name))=LOWER('Depilação a laser díodo — mulher — Virilha cavada')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a cera — mulher — Virilha cavada', 'RP-056', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 8, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-056' OR LOWER(TRIM(s.name))=LOWER('Depilação a cera — mulher — Virilha cavada')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a laser díodo — homem — Virilha cavada', 'RP-057', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 20, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-057' OR LOWER(TRIM(s.name))=LOWER('Depilação a laser díodo — homem — Virilha cavada')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a laser díodo — mulher — Virilhas completas', 'RP-058', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 20, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-058' OR LOWER(TRIM(s.name))=LOWER('Depilação a laser díodo — mulher — Virilhas completas')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a cera — mulher — Virilhas completas', 'RP-059', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 15, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-059' OR LOWER(TRIM(s.name))=LOWER('Depilação a cera — mulher — Virilhas completas')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a laser díodo — homem — Virilhas completas', 'RP-060', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 25, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-060' OR LOWER(TRIM(s.name))=LOWER('Depilação a laser díodo — homem — Virilhas completas')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a laser díodo — mulher — Glúteos', 'RP-061', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 15, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-061' OR LOWER(TRIM(s.name))=LOWER('Depilação a laser díodo — mulher — Glúteos')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a cera — mulher — Glúteos', 'RP-062', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 8, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-062' OR LOWER(TRIM(s.name))=LOWER('Depilação a cera — mulher — Glúteos')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a laser díodo — homem — Glúteos', 'RP-063', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 20, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-063' OR LOWER(TRIM(s.name))=LOWER('Depilação a laser díodo — homem — Glúteos')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a laser díodo — mulher — Meia perna', 'RP-064', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 20, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-064' OR LOWER(TRIM(s.name))=LOWER('Depilação a laser díodo — mulher — Meia perna')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a cera — mulher — Meia perna', 'RP-065', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 13, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-065' OR LOWER(TRIM(s.name))=LOWER('Depilação a cera — mulher — Meia perna')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a laser díodo — homem — Meia perna', 'RP-066', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 25, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-066' OR LOWER(TRIM(s.name))=LOWER('Depilação a laser díodo — homem — Meia perna')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a cera — homem — Meia perna', 'RP-067', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 15, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-067' OR LOWER(TRIM(s.name))=LOWER('Depilação a cera — homem — Meia perna')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a laser díodo — mulher — Perna completa', 'RP-068', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 30, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-068' OR LOWER(TRIM(s.name))=LOWER('Depilação a laser díodo — mulher — Perna completa')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a cera — mulher — Perna completa', 'RP-069', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 20, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-069' OR LOWER(TRIM(s.name))=LOWER('Depilação a cera — mulher — Perna completa')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a laser díodo — homem — Perna completa', 'RP-070', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 35, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-070' OR LOWER(TRIM(s.name))=LOWER('Depilação a laser díodo — homem — Perna completa')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a cera — homem — Perna completa', 'RP-071', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 25, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-071' OR LOWER(TRIM(s.name))=LOWER('Depilação a cera — homem — Perna completa')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a laser díodo — mulher — Corpo completo', 'RP-072', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 55, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-072' OR LOWER(TRIM(s.name))=LOWER('Depilação a laser díodo — mulher — Corpo completo')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a cera — mulher — Corpo completo', 'RP-073', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 40, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-073' OR LOWER(TRIM(s.name))=LOWER('Depilação a cera — mulher — Corpo completo')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a laser díodo — homem — Corpo completo', 'RP-074', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 110, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-074' OR LOWER(TRIM(s.name))=LOWER('Depilação a laser díodo — homem — Corpo completo')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Depilação a cera — homem — Corpo completo', 'RP-075', 'Depilação', 'Preçário fornecido pela RP, em vigor desde 01/01/2025. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 65, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-075' OR LOWER(TRIM(s.name))=LOWER('Depilação a cera — homem — Corpo completo')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Gessoterapia', 'RP-076', 'Corpo', 'Valor sob consulta. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 0, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-076' OR LOWER(TRIM(s.name))=LOWER('Gessoterapia')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'JetBronze', 'RP-077', 'Corpo', 'Valor sob consulta. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 0, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-077' OR LOWER(TRIM(s.name))=LOWER('JetBronze')));

INSERT INTO clinic_services (id,account_id,user_id,name,reference,category,description,duration_minutes,price,currency,color,is_active,online_enabled,show_on_site,internal_booking_enabled)
SELECT UUID(), a.id, a.owner_user_id, 'Formações/workshops', 'RP-078', 'Formação', 'Valor sob consulta. Duração provisória de agenda: validar antes de ativar marcação online.', 60, 0, 'EUR', '#9d7144', TRUE, FALSE, TRUE, TRUE
FROM accounts a
WHERE LOWER(TRIM(a.name)) LIKE 'rp%instituto%beleza%'
AND NOT EXISTS (SELECT 1 FROM clinic_services s WHERE s.account_id=a.id AND (s.reference='RP-078' OR LOWER(TRIM(s.name))=LOWER('Formações/workshops')));

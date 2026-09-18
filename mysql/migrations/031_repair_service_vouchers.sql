-- A voucher tied to a service represents one entitlement, even when it was
-- created before the remaining_uses field was sent by the POS.
UPDATE finance_vouchers v
JOIN clinic_services s ON s.id=v.service_id AND s.account_id=v.account_id
SET v.remaining_uses=COALESCE(v.remaining_uses, 1),
    v.initial_balance=CASE WHEN v.initial_balance<=0 THEN s.price ELSE v.initial_balance END,
    v.current_balance=CASE WHEN v.current_balance<=0 AND v.status IN ('active','pending') THEN s.price ELSE v.current_balance END
WHERE v.voucher_type='service' AND v.service_id IS NOT NULL;

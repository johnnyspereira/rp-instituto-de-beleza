-- Operational actions for the business hub.

CREATE OR REPLACE FUNCTION adjust_clinic_product_stock(
  p_product_id UUID,
  p_quantity INTEGER,
  p_movement_type TEXT,
  p_reason TEXT DEFAULT NULL
)
RETURNS clinic_products
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_product clinic_products;
  v_stock_after INTEGER;
BEGIN
  IF p_quantity IS NULL OR p_quantity = 0 THEN
    RAISE EXCEPTION 'Quantity must be different from zero';
  END IF;

  IF p_movement_type NOT IN ('purchase', 'adjustment', 'return') THEN
    RAISE EXCEPTION 'Invalid stock movement type';
  END IF;

  SELECT * INTO v_product
  FROM clinic_products
  WHERE id = p_product_id
  FOR UPDATE;

  IF NOT FOUND OR NOT is_account_member(v_product.account_id, 'admin') THEN
    RAISE EXCEPTION 'Product not found or not authorised';
  END IF;

  v_stock_after := v_product.stock_quantity + p_quantity;
  IF v_stock_after < 0 THEN
    RAISE EXCEPTION 'Stock cannot become negative';
  END IF;

  UPDATE clinic_products
  SET stock_quantity = v_stock_after,
      updated_at = NOW()
  WHERE id = v_product.id
  RETURNING * INTO v_product;

  INSERT INTO finance_stock_movements (
    account_id,
    product_id,
    user_id,
    movement_type,
    quantity,
    stock_after,
    notes
  ) VALUES (
    v_product.account_id,
    v_product.id,
    auth.uid(),
    p_movement_type,
    p_quantity,
    v_stock_after,
    NULLIF(BTRIM(p_reason), '')
  );

  RETURN v_product;
END;
$$;

GRANT EXECUTE ON FUNCTION adjust_clinic_product_stock(UUID, INTEGER, TEXT, TEXT)
TO authenticated;

NOTIFY pgrst, 'reload schema';

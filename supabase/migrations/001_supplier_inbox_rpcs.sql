-- =============================================================
-- Migration: Supplier Inbox RPC functions
-- Adds: reject_order, mark_ready
-- Adds: commission_amount column to orders table
-- =============================================================

-- 1. Add commission_amount column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'commission_amount'
  ) THEN
    ALTER TABLE orders ADD COLUMN commission_amount numeric(10,2) DEFAULT 0;
  END IF;
END $$;

-- 2. Add delivered_at column if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'orders' AND column_name = 'delivered_at'
  ) THEN
    ALTER TABLE orders ADD COLUMN delivered_at timestamptz;
  END IF;
END $$;

-- 3. reject_order: supplier rejects a pending order
--    Only the order's supplier can reject, and only from pending status
CREATE OR REPLACE FUNCTION reject_order(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_supplier_id uuid;
  v_status text;
BEGIN
  SELECT supplier_id, status INTO v_supplier_id, v_status
  FROM orders WHERE id = p_order_id;

  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF v_supplier_id != auth.uid() THEN
    RAISE EXCEPTION 'You are not the supplier for this order.';
  END IF;

  IF v_status != 'pending' THEN
    RAISE EXCEPTION 'Only pending orders can be rejected. Current status: %', v_status;
  END IF;

  UPDATE orders SET status = 'rejected' WHERE id = p_order_id;
END;
$$;

-- 4. mark_ready: supplier marks an accepted order as ready for delivery/pickup
--    Only the order's supplier can do this, and only from accepted status
CREATE OR REPLACE FUNCTION mark_ready(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_supplier_id uuid;
  v_status text;
BEGIN
  SELECT supplier_id, status INTO v_supplier_id, v_status
  FROM orders WHERE id = p_order_id;

  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF v_supplier_id != auth.uid() THEN
    RAISE EXCEPTION 'You are not the supplier for this order.';
  END IF;

  IF v_status != 'accepted' THEN
    RAISE EXCEPTION 'Only accepted orders can be marked ready. Current status: %', v_status;
  END IF;

  UPDATE orders SET status = 'ready' WHERE id = p_order_id;
END;
$$;

-- 5. Update mark_delivered to also calculate commission and set delivered_at
CREATE OR REPLACE FUNCTION mark_delivered(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_supplier_id uuid;
  v_status text;
  v_total numeric;
  v_rate numeric := 0.03; -- 3% commission
BEGIN
  SELECT supplier_id, status INTO v_supplier_id, v_status
  FROM orders WHERE id = p_order_id;

  IF v_supplier_id IS NULL THEN
    RAISE EXCEPTION 'Order not found.';
  END IF;

  IF v_supplier_id != auth.uid() THEN
    RAISE EXCEPTION 'You are not the supplier for this order.';
  END IF;

  IF v_status != 'ready' THEN
    RAISE EXCEPTION 'Only orders marked as ready can be delivered. Current status: %', v_status;
  END IF;

  -- Calculate total from order_items
  SELECT COALESCE(SUM(unit_price * quantity), 0) INTO v_total
  FROM order_items WHERE order_id = p_order_id;

  UPDATE orders
  SET status = 'delivered',
      delivered_at = now(),
      commission_amount = ROUND(v_total * v_rate, 2)
  WHERE id = p_order_id;
END;
$$;

-- 6. Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION reject_order(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_ready(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION mark_delivered(uuid) TO authenticated;

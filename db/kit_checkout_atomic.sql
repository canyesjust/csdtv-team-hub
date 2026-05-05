-- Atomic kit checkout: one loan row + all kit equipment marked checked_out + activity rows.
-- Run in Supabase SQL editor after reviewing RLS; same deployment story as equipment_checkout_atomic.
-- Grants: allow service role / authenticated per your existing equipment_checkout_atomic pattern.

CREATE OR REPLACE FUNCTION public.kit_checkout_atomic(
  p_kit_id uuid,
  p_borrower_name text,
  p_borrower_info text,
  p_due_date date,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_kit_name text;
  v_borrower text := trim(p_borrower_name);
  v_info text := nullif(trim(coalesce(p_borrower_info, '')), '');
  r_equipment_id uuid;
BEGIN
  IF v_borrower = '' THEN
    RETURN jsonb_build_object('success', false, 'message', 'Borrower name required', 'status', 400);
  END IF;

  SELECT name INTO v_kit_name FROM equipment_kits WHERE id = p_kit_id;
  IF v_kit_name IS NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Kit not found', 'status', 404);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM equipment_kit_items WHERE kit_id = p_kit_id) THEN
    RETURN jsonb_build_object('success', false, 'message', 'Kit has no items', 'status', 400);
  END IF;

  IF EXISTS (
    SELECT 1
    FROM equipment_kit_items eki
    JOIN equipment e ON e.id = eki.equipment_id
    WHERE eki.kit_id = p_kit_id AND e.status IS DISTINCT FROM 'available'
  ) THEN
    RETURN jsonb_build_object('success', false, 'message', 'One or more kit items are not available', 'status', 400);
  END IF;

  INSERT INTO equipment_loans (
    kit_id,
    equipment_id,
    borrower_name,
    borrower_info,
    checked_out_by,
    due_date
  )
  VALUES (
    p_kit_id,
    NULL,
    v_borrower,
    v_info,
    p_user_id,
    p_due_date
  );

  FOR r_equipment_id IN
    SELECT eki.equipment_id FROM equipment_kit_items eki WHERE eki.kit_id = p_kit_id
  LOOP
    UPDATE equipment
    SET status = 'checked_out', updated_at = now()
    WHERE id = r_equipment_id AND status = 'available';

    IF NOT FOUND THEN
      RAISE EXCEPTION USING MESSAGE = 'kit_checkout_race';
    END IF;

    INSERT INTO equipment_activity (
      equipment_id,
      action,
      detail,
      user_id
    )
    VALUES (
      r_equipment_id,
      'checked_out',
      format('Checked out as part of kit "%s" to %s', v_kit_name, v_borrower),
      p_user_id
    );
  END LOOP;

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM = 'kit_checkout_race' THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'A kit item was checked out by someone else. Refresh and try again.',
        'status', 409
      );
    END IF;
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Kit checkout failed',
      'status', 500
    );
END;
$$;

COMMENT ON FUNCTION public.kit_checkout_atomic(uuid, text, text, date, uuid) IS
  'Checks out all equipment in a kit in one transaction; rolls back on any failure.';

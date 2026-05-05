-- Atomic equipment check-in: single-item loan OR full kit loan (all kit items → available).
-- Replaces or creates public.equipment_checkin_atomic; run in Supabase SQL editor.
-- Call path: app/api/equipment/checkin/route.ts (service role).

CREATE OR REPLACE FUNCTION public.equipment_checkin_atomic(
  p_loan_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_loan equipment_loans%ROWTYPE;
  v_kit_name text;
  r_equipment_id uuid;
BEGIN
  SELECT * INTO v_loan FROM equipment_loans WHERE id = p_loan_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'message', 'Loan not found', 'status', 404);
  END IF;
  IF v_loan.checked_in_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'message', 'Already checked in', 'status', 400);
  END IF;

  -- Single equipment loan
  IF v_loan.equipment_id IS NOT NULL THEN
    UPDATE equipment
    SET status = 'available', updated_at = now()
    WHERE id = v_loan.equipment_id AND status = 'checked_out';
    IF NOT FOUND THEN
      RETURN jsonb_build_object(
        'success', false,
        'message', 'Equipment is not marked checked out',
        'status', 409
      );
    END IF;
    UPDATE equipment_loans SET checked_in_at = now() WHERE id = p_loan_id;
    INSERT INTO equipment_activity (equipment_id, action, detail, user_id)
    VALUES (
      v_loan.equipment_id,
      'checked_in',
      format('Checked in (loan %s)', p_loan_id),
      p_user_id
    );
    RETURN jsonb_build_object('success', true);
  END IF;

  -- Kit loan (equipment_id is null)
  IF v_loan.kit_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'message', 'Invalid loan: missing equipment and kit',
      'status', 400
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM equipment_kit_items WHERE kit_id = v_loan.kit_id) THEN
    UPDATE equipment_loans SET checked_in_at = now() WHERE id = p_loan_id;
    RETURN jsonb_build_object('success', true);
  END IF;

  SELECT name INTO v_kit_name FROM equipment_kits WHERE id = v_loan.kit_id;

  BEGIN
    FOR r_equipment_id IN
      SELECT eki.equipment_id FROM equipment_kit_items eki WHERE eki.kit_id = v_loan.kit_id
    LOOP
      UPDATE equipment
      SET status = 'available', updated_at = now()
      WHERE id = r_equipment_id AND status = 'checked_out';
      IF NOT FOUND THEN
        RAISE EXCEPTION USING MESSAGE = 'kit_checkin_race';
      END IF;
      INSERT INTO equipment_activity (equipment_id, action, detail, user_id)
      VALUES (
        r_equipment_id,
        'checked_in',
        format('Checked in as part of kit "%s"', coalesce(v_kit_name, 'kit')),
        p_user_id
      );
    END LOOP;

    UPDATE equipment_loans SET checked_in_at = now() WHERE id = p_loan_id;
    RETURN jsonb_build_object('success', true);
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM = 'kit_checkin_race' THEN
        RETURN jsonb_build_object(
          'success', false,
          'message', 'A kit item changed status while checking in. Refresh and try again.',
          'status', 409
        );
      END IF;
      RETURN jsonb_build_object('success', false, 'message', 'Check-in failed', 'status', 500);
  END;
END;
$$;

COMMENT ON FUNCTION public.equipment_checkin_atomic(uuid, uuid) IS
  'Checks in one equipment item or all items in a kit loan in one transaction.';

GRANT EXECUTE ON FUNCTION public.equipment_checkin_atomic(uuid, uuid) TO service_role;

-- Idempotent copy of supabase/migrations/20260601120000_production_datetime_from_label.sql
-- Apply in Supabase SQL Editor when not running migrations.

-- Parse district sync labels into timestamptz columns (America/Denver).
-- Extension writes start_datetime_label / end_datetime_label; this keeps start_datetime / end_datetime queryable.

CREATE OR REPLACE FUNCTION public.parse_production_datetime_label(p_label text)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
STRICT
SET search_path = public
AS $$
DECLARE
  v_trim text;
  v_naive timestamp without time zone;
BEGIN
  v_trim := btrim(p_label);
  IF v_trim = '' THEN
    RETURN NULL;
  END IF;

  IF v_trim ~ '^\d{4}-\d{2}-\d{2}' THEN
    BEGIN
      RETURN v_trim::timestamptz;
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END IF;

  BEGIN
    v_naive := to_timestamp(v_trim, 'Mon FMdd, YYYY FMHH12:MI:SS AM');
    RETURN v_naive AT TIME ZONE 'America/Denver';
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  BEGIN
    v_naive := to_timestamp(v_trim, 'Mon FMdd, YYYY FMHH12:MI AM');
    RETURN v_naive AT TIME ZONE 'America/Denver';
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  BEGIN
    v_naive := to_timestamp(v_trim, 'Mon FMdd, YYYY');
    RETURN (v_naive + time '12:00') AT TIME ZONE 'America/Denver';
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.production_event_date_noon(p_event_date date)
RETURNS timestamptz
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = public
AS $$
  SELECT ((p_event_date + time '12:00')::timestamp without time zone AT TIME ZONE 'America/Denver');
$$;

CREATE OR REPLACE FUNCTION public.sync_production_row_datetimes()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_start timestamptz;
  v_end timestamptz;
BEGIN
  IF NEW.start_datetime_label IS NOT NULL AND btrim(NEW.start_datetime_label) <> '' THEN
    v_start := public.parse_production_datetime_label(NEW.start_datetime_label);
    IF v_start IS NOT NULL THEN
      NEW.start_datetime := v_start;
    END IF;
  ELSIF NEW.start_datetime IS NULL AND NEW.event_date IS NOT NULL THEN
    NEW.start_datetime := public.production_event_date_noon(NEW.event_date);
  END IF;

  IF NEW.end_datetime_label IS NOT NULL AND btrim(NEW.end_datetime_label) <> '' THEN
    v_end := public.parse_production_datetime_label(NEW.end_datetime_label);
    IF v_end IS NOT NULL THEN
      NEW.end_datetime := v_end;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS productions_sync_datetimes_from_labels ON public.productions;
CREATE TRIGGER productions_sync_datetimes_from_labels
  BEFORE INSERT OR UPDATE OF start_datetime_label, end_datetime_label, event_date
  ON public.productions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_production_row_datetimes();

UPDATE public.productions p
SET start_datetime = public.parse_production_datetime_label(p.start_datetime_label)
WHERE p.start_datetime_label IS NOT NULL
  AND btrim(p.start_datetime_label) <> ''
  AND public.parse_production_datetime_label(p.start_datetime_label) IS NOT NULL
  AND (
    p.start_datetime IS NULL
    OR p.start_datetime IS DISTINCT FROM public.parse_production_datetime_label(p.start_datetime_label)
  );

UPDATE public.productions p
SET start_datetime = public.production_event_date_noon(p.event_date)
WHERE p.start_datetime IS NULL
  AND p.event_date IS NOT NULL
  AND (p.start_datetime_label IS NULL OR btrim(p.start_datetime_label) = '');

UPDATE public.productions p
SET end_datetime = public.parse_production_datetime_label(p.end_datetime_label)
WHERE p.end_datetime_label IS NOT NULL
  AND btrim(p.end_datetime_label) <> ''
  AND public.parse_production_datetime_label(p.end_datetime_label) IS NOT NULL
  AND (
    p.end_datetime IS NULL
    OR p.end_datetime IS DISTINCT FROM public.parse_production_datetime_label(p.end_datetime_label)
  );

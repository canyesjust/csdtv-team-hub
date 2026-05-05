-- CSDtv Productions Schema Update v2
-- Safe to re-run: all columns are additive with IF NOT EXISTS.

ALTER TABLE productions
  ADD COLUMN IF NOT EXISTS status_code               integer,
  ADD COLUMN IF NOT EXISTS created_on                text,
  ADD COLUMN IF NOT EXISTS is_on_behalf              boolean,
  ADD COLUMN IF NOT EXISTS sent_approved_email       boolean,
  ADD COLUMN IF NOT EXISTS focus_area_code           text,
  ADD COLUMN IF NOT EXISTS filming_location_details  text,
  ADD COLUMN IF NOT EXISTS start_datetime_label      text,
  ADD COLUMN IF NOT EXISTS end_datetime_label        text,
  ADD COLUMN IF NOT EXISTS video_addons_array        jsonb,
  ADD COLUMN IF NOT EXISTS audio_options_array       jsonb,
  ADD COLUMN IF NOT EXISTS submitter_user_id         integer,
  ADD COLUMN IF NOT EXISTS submitter_site_user_id    text,
  ADD COLUMN IF NOT EXISTS submitter_username        text,
  ADD COLUMN IF NOT EXISTS submitter_name            text,
  ADD COLUMN IF NOT EXISTS submitter_email           text,
  ADD COLUMN IF NOT EXISTS submitter_building_code   text,
  ADD COLUMN IF NOT EXISTS submitter_employee_number text,
  ADD COLUMN IF NOT EXISTS production_staff          jsonb;

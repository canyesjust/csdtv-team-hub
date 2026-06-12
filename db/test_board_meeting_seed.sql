-- ============================================================================
-- TEST BOARD MEETING — reset + seed  (safe to re-run anytime)
-- ----------------------------------------------------------------------------
-- Run this whole script in the Supabase SQL editor whenever you want a clean
-- test meeting to play with (agenda import, motions, voting, dais, preroll,
-- signage takeover, etc.).
--
-- It only ever touches the two fixed TEST ids below, so your real meetings are
-- never affected. Deleting the test production cascades and wipes everything
-- attached to it (agenda items, attendance, motions, votes, broadcast state).
--
--   TEST production id : 11111111-1111-4111-8111-111111111111
--   TEST meeting id    : 22222222-2222-4222-8222-222222222222
--
-- Voting members come from your real `lower_third_people` (category =
-- 'board_member', is_active = true) — the test meeting reuses them, so the
-- vote grid and quorum work without seeding any people.
-- ============================================================================

begin;

-- 1) Wipe any previous test meeting (cascades to board_meetings + everything).
delete from public.productions
where id = '11111111-1111-4111-8111-111111111111';

-- 2) Clone a REAL board-meeting production into the test row. We build the column
--    list dynamically and EXCLUDE generated columns (e.g. search_vector), since
--    you can't insert into those at all. Every other column is copied from the
--    most recent real board meeting (satisfies NOT NULLs), with the identifying
--    fields overridden. Requires one existing board-meeting production to copy.
do $$
declare
  collist text;
  sellist text;
begin
  select
    string_agg(quote_ident(column_name), ', ' order by ordinal_position),
    string_agg(
      case column_name
        when 'id'                then quote_literal('11111111-1111-4111-8111-111111111111')
        when 'title'             then quote_literal('ZZ TEST — Board Meeting (sandbox)')
        when 'production_number' then '999999999'
        when 'livestream_url'    then 'NULL'
        when 'start_datetime'    then 'now()'
        when 'created_at'        then 'now()'
        when 'updated_at'        then 'now()'
        else quote_ident(column_name)
      end, ', ' order by ordinal_position)
  into collist, sellist
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'productions'
    and is_generated <> 'ALWAYS';

  execute format(
    'insert into public.productions (%s) select %s from public.productions ' ||
    'where request_type_number = 4 order by created_at desc limit 1',
    collist, sellist
  );
end $$;

-- 3) The board meeting row.
insert into public.board_meetings (id, production_id, broadcast_status, scheduled_public_start)
values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'prepared',
  now()
);

-- 4) A realistic mini-agenda: procedural items, a recognition, a bundled
--    Consent Agenda (one motion for 7A–7C), individual action items with their
--    own motion wording, an information item, and adjournment.
insert into public.board_meeting_agenda_items
  (board_meeting_id, section_number, section_title, item_number, sort_order,
   title, type, action_requested, is_broadcastable, consent_block, suggested_motion_text)
values
  ('22222222-2222-4222-8222-222222222222', 1, 'Opening',        '1A', 0, 'Call to Order',                            'procedural',  false, true, null, null),
  ('22222222-2222-4222-8222-222222222222', 1, 'Opening',        '1B', 1, 'Pledge of Allegiance',                     'procedural',  false, true, null, null),
  ('22222222-2222-4222-8222-222222222222', 1, 'Opening',        '1C', 2, 'Roll Call',                                'procedural',  false, true, null, null),
  ('22222222-2222-4222-8222-222222222222', 2, 'Recognition',    '2A', 3, 'Recognition of Students of the Month',     'recognition', false, true, null, null),
  ('22222222-2222-4222-8222-222222222222', 3, 'Patron Comment', '3A', 4, 'Patron Comment',                           'procedural',  false, true, null, null),
  ('22222222-2222-4222-8222-222222222222', 7, 'Consent Agenda', '7A', 5, 'Approval of Minutes',                      'action', true, true, 'Consent Agenda', 'Move to approve the Consent Agenda.'),
  ('22222222-2222-4222-8222-222222222222', 7, 'Consent Agenda', '7B', 6, 'Approval of Hire and Termination Reports', 'action', true, true, 'Consent Agenda', 'Move to approve the Consent Agenda.'),
  ('22222222-2222-4222-8222-222222222222', 7, 'Consent Agenda', '7C', 7, 'Approval of Financial Reports',            'action', true, true, 'Consent Agenda', 'Move to approve the Consent Agenda.'),
  ('22222222-2222-4222-8222-222222222222', 8, 'Action Items',   '8A', 8, 'Approval of the 2026–2027 Budget',         'action', true, true, null, 'Move to approve the 2026–2027 Budget.'),
  ('22222222-2222-4222-8222-222222222222', 8, 'Action Items',   '8B', 9, 'Approval of New School Bus Purchase',      'action', true, true, null, 'Move to approve the new school bus purchase.'),
  ('22222222-2222-4222-8222-222222222222', 9, 'Information',    '9A', 10, 'Superintendent''s Report',                'information', false, true, null, null),
  ('22222222-2222-4222-8222-222222222222', 10, 'Adjournment',  '10A', 11, 'Adjournment',                             'procedural',  false, true, null, null);

commit;

-- Find it in the app by searching productions for "ZZ TEST".
-- To remove the test meeting entirely:
--   delete from public.productions where id = '11111111-1111-4111-8111-111111111111';

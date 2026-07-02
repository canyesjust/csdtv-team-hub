-- Manual opt-in flag for the digital-signage "Upcoming broadcasts" board.
-- When true, an upcoming livestream / board-meeting production is featured on
-- the signage board (next 30 days, up to 8, soonest first). Editors toggle this
-- per production; nothing shows automatically.
ALTER TABLE public.productions
  ADD COLUMN IF NOT EXISTS feature_on_broadcast_board boolean NOT NULL DEFAULT false;

-- Partial index: the feed only ever queries the flagged rows, ordered by start.
CREATE INDEX IF NOT EXISTS productions_broadcast_board_idx
  ON public.productions (feature_on_broadcast_board, start_datetime)
  WHERE feature_on_broadcast_board;

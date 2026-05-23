-- Optional: declare FKs from knowledge_base to team so PostgREST can embed author names.
-- Safe to re-run; skips if constraints already exist.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_base_created_by_fkey'
  ) THEN
    ALTER TABLE public.knowledge_base
      ADD CONSTRAINT knowledge_base_created_by_fkey
      FOREIGN KEY (created_by) REFERENCES public.team (id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'knowledge_base_updated_by_fkey'
  ) THEN
    ALTER TABLE public.knowledge_base
      ADD CONSTRAINT knowledge_base_updated_by_fkey
      FOREIGN KEY (updated_by) REFERENCES public.team (id);
  END IF;
END $$;

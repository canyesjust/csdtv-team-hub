# CSDtv Team Hub

Internal ops platform for Canyons School District TV
([csdtvstaff.org](https://www.csdtvstaff.org)): productions, tasks, board-meeting
control, digital signage, brand library, equipment, and crew signup.

## Stack

- Next.js 16 (App Router) + React 19 on Vercel
- Supabase (Auth, Postgres, Storage, Edge Functions)
- Tailwind CSS 4

## Local setup

```bash
npm install
cp .env.local.example .env.local   # if present; otherwise copy from Vercel/Supabase
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

Required env (server): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
`SUPABASE_SERVICE_ROLE_KEY`, plus feature secrets as needed (`CRON_SECRET`,
`SIGNAGE_TASKS_KEY`, etc.). Never commit `.env*` files.

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server (generates signage CSS first) |
| `npm run build` | Production build |
| `npm run lint` | ESLint |
| `npm run test:signage` | Signage HTML/React golden snapshots |

## Docs

- Security baseline: `docs/security-review-2026-06-24.md`
- Agent / security rules: `CLAUDE.md`
- Schema: prefer `supabase/migrations/`; see `db/README.md` for legacy scripts

## Desktop apps

macOS/Windows helpers live under `desktop/` (Blackmagic updater, ad-controller)
and publish via GitHub Actions releases.

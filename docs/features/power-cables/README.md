# Power cables feature — docs index

| File | Purpose |
|------|---------|
| [DECISIONS.md](./DECISIONS.md) | Locked product + implementation decisions (read this first). |
| [power-cable-cursor-spec.md](./power-cable-cursor-spec.md) | Main feature spec (DB, UI, flows). |
| [power-cable-cursor-spec-permissions-addendum.md](./power-cable-cursor-spec-permissions-addendum.md) | Equipment RLS + UI gates — **override rows for Staff vs Manager in [DECISIONS.md](./DECISIONS.md)**. |
| [CSDtv-Connector-Visual-Dictionary.html](./CSDtv-Connector-Visual-Dictionary.html) | Legacy bundled HTML reference (tables/SVG inline). |
| **Connector SVGs (canonical)** | `public/connector-svgs/*.svg` — served at **`/connector-svgs/<filename>.svg`** in production and on Vercel previews. Use these in Knowledge base articles, e.g. `<img src="/connector-svgs/iec-c13.svg" alt="IEC C13" />` (requires KB sanitizer to allow `IMG` — see [DECISIONS.md](./DECISIONS.md)). |


Implementation lives in the app under `app/dashboard/equipment/` when built.

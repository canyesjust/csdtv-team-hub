# Library article import & export

Team Hub → **Library** → **Articles** supports bulk import and export for managers and staff.

## Import formats

### JSON

Root must be an **array** or `{ "articles": [ ... ] }`:

```json
[
  {
    "title": "Equipment Checkout Policy",
    "category": "Policy",
    "content": "<h2>Overview</h2><p>Steps here.</p>"
  }
]
```

Field aliases: `name` → title; `type` → category; `body` / `html` / `text` → content.

### CSV

Header row required. Columns: `title`, `category`, `content`.

```csv
title,category,content
Livestream Setup Process,Process,"<h2>Prep</h2><ol><li>Pack kit.</li></ol>"
```

Quote `content` when it contains commas or line breaks. Use `""` to escape quotes inside a field.

### Categories

`Process`, `Workflow`, `Policy`, `Reference`, `Other` (unknown values become `Other`).

### Content

- **HTML** — use tags: `p`, `h2`, `h3`, `ul`, `ol`, `li`, `strong`, `em`, `hr`, `br`, `a`
- **Plain text** — blank line between paragraphs; single newlines become line breaks

`content` must be a **string**, not a nested JSON object.

### Duplicate titles

On import, choose:

| Mode | Behavior |
|------|----------|
| **Skip duplicates** (default) | Existing title unchanged; row skipped |
| **Update existing** | Replace category and content on matching title |
| **Allow duplicates** | Always insert new rows (same title allowed) |

Matching is case-insensitive on trimmed title.

## Export

Use **Export JSON** or **Export CSV** on the Articles tab. Exports the current list (respects search/filter).

Re-import with **Update existing** to refresh content in bulk.

## Onboarding links

After articles exist, open **Onboarding → Edit templates** and use **Link Library by title** to attach articles to checklist items (matches titles like “Read … in Library”).

## Print

Open an article and click **Print** for a clean printable view.

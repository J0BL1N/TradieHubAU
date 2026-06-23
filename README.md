# TradieHubAU

## Roadmap

TradieHubAU is currently in local MVP development.

For the full detailed roadmap, see: [docs/ROADMAP.md](docs/ROADMAP.md)

### Completed / Approved

* [x] v0.0.10 — Project structure cleanup
* [x] v0.0.11 — Jobs UX final polish
* [x] Hotfix — Admin UUID display
* [x] Hotfix — Job modal overlay behavior

### Current

* [ ] v0.0.12 — Completion + dispute flow polish *(implementation-complete, awaiting manual review)*

  * Completion proof image uploads
  * Dedicated Submit Completion modal
  * Dedicated Review Completion modal
  * 72-hour review countdown
  * Contact details locked until protected payment is funded
  * Fee/payout breakdown
  * Guest public browsing
  * My Jobs status filtering

* [ ] v0.0.13 — Admin dashboard polish *(implementation-complete, awaiting manual review)*

  * Replaced browser alert/confirm dialogs with in-page toast + confirm modals
  * Fixed disputes section structure (now its own top-level card)
  * Added Active Disputes stats tile
  * Customer dispute evidence photos visible in dispute cards
  * Improved dispute card layout (job ref, date, status badge)
  * Fixed document type label formatting
  * Role column added to identity verification queue

### Next

* [ ] v0.0.14 — Full manual customer/tradie/admin test run
* [ ] v0.0.15 — Security/RLS/storage audit
* [ ] v0.1.0 — Controlled local beta prep

### Later

* [ ] v0.2.x — Real payments foundation
* [ ] v0.3.x — Admin → Finance & Accounting
* [ ] v0.3.x — GST/accountant export readiness
* [ ] v0.4.x — Messaging and contact controls
* [ ] v0.5.x — Trust, verification, and safety
* [ ] v0.6.x — Reviews and reputation
* [ ] v0.7.x — Notifications
* [ ] v0.8.x — Public site / marketing
* [ ] v1.0 — Production launch readiness

## Development Instructions

Current app:
```bash
cd F:\TradieHubAU\frontend
npm run dev
```

Supabase project:
`F:\TradieHubAU\supabase`

Do not use Go Live for the current React/Vite app.
Go Live may open archived static files or cached localhost pages.

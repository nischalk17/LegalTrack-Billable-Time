# AI Coding Assistant Development Log
## LegalTrack - Billable Time Tracker MVP

---

## How AI Was Used

This project was developed with Claude (Anthropic) as the primary coding assistant.
The development approach was **prompt-driven architecture first, then feature implementation**.

---

## Phase 0 — Architecture Planning

**Prompt:**
> "I need to build an MVP for automatic billable time tracking for legal work. Stack: Next.js, Express.js, PostgreSQL. Features: browser tracking, desktop app tracking, manual CRUD, billable suggestions. Windows only for desktop. Railway for hosting. JWT auth. Give me a step-by-step feature-driven build plan."

**AI Generated:**
- Full monorepo structure layout
- Phase-by-phase build plan (0 through 7)
- Technology decision rationale (Railway over GCP for simplicity)
- Database table design overview

**Manually decided:**
- Railway over GCP (faster free tier setup)
- IBM Plex font family for legal/professional aesthetic
- Single-file Chrome extension approach (no build step)

---

## Phase 1 — Database Schema

**Prompt:**
> "Generate a PostgreSQL schema for: users (basic JWT auth), tracked_activities (browser + desktop events), manual_entries (CRUD with client/matter/description/date/duration/notes), billable_suggestions (auto-generated from activities with status). Use UUIDs, proper indexes, foreign keys, and an auto-update trigger for updated_at."

**AI Generated:** Full `schema.sql` with:
- All 4 tables with proper column types
- UUID primary keys via `uuid-ossp`
- Foreign key relationships with CASCADE
- Indexes on user_id, date, status columns
- PL/pgSQL trigger for `updated_at`
- Demo user seed

**Manually reviewed:**
- Verified CHECK constraints made sense
- Confirmed duration stored as seconds (activities) vs minutes (entries) for appropriate granularity

---

## Phase 2 — Backend API

**Prompt:**
> "Build Express.js routes for: POST /api/activities (ingest), POST /api/activities/batch (bulk ingest), GET /api/activities (list with filters + pagination), GET /api/activities/stats (daily summary). Use express-validator, the pg pool, and JWT auth middleware."

**AI Generated:** All route files including:
- `auth.js` — register/login/me with bcrypt + JWT
- `activities.js` — ingest, batch, list, stats
- `entries.js` — full CRUD with validation
- `suggestions.js` — generate + accept/dismiss workflow

**Prompt for suggestion logic:**
> "Write a classifyActivity() function in JavaScript that takes a tracked activity object and returns a { category, description } based on these rules: westlaw/lexis/casetext → legal_research, pacer → court_filing, PDF files → document_review, Word + motion/brief/contract/agreement → drafting, Outlook/Gmail → client_communication, Zoom/Teams → client_meeting. Fall back to general_work for desktop, research for browser."

**AI Generated:** `classifyActivity()` with pattern matching
**Manually added:** Additional domains (fastcase, courtlistener), Excel → analysis category

---

## Phase 3 — Chrome Extension

**Prompt:**
> "Write a Chrome Extension Manifest V3 background service worker that: tracks active tab title and domain, records start time on tab change, computes duration on next tab change, buffers events in memory, flushes to POST /api/activities/batch every 60 seconds via alarm, handles browser focus lost, accepts auth token via chrome.storage."

**AI Generated:** Full `background.js` service worker with:
- Tab event listeners (onActivated, onUpdated, onFocusChanged, onRemoved)
- Session start/end logic
- Periodic flush via `chrome.alarms`
- Message passing for popup

**Manually added:**
- Skip sessions under 5 seconds (noise reduction)
- Restart current session on flush (avoid losing in-progress time)

---

## Phase 4 — Desktop Tracker

**Prompt:**
> "Write a Node.js script using the 'active-win' package (ESM) that polls the active window every 10 seconds, groups consecutive same-app/title events, ends a session when the app changes, and sends batches to /api/activities/batch. Target Windows. Include file name extraction from window title."

**AI Generated:** `tracker/src/index.js` with:
- `active-win` polling loop
- Session grouping logic
- `extractFileName()` regex for common patterns
- Graceful SIGINT shutdown with final flush

**Manually reviewed:**
- Confirmed `active-win` v8 uses ESM (`"type": "module"`)
- Added minimum 10-second duration filter

---

## Phase 5 — Frontend Dashboard

**Prompt:**
> "Build a Next.js 14 App Router dashboard with these pages: (1) Dashboard home with today's stats grid, (2) Activities timeline table with date + source filter, (3) Manual entries CRUD with modal form and delete confirm, (4) Billable suggestions with Accept/Dismiss per card. Use a dark legal/professional aesthetic — IBM Plex font, GitHub-dark color palette, monospaced durations. No Tailwind components — pure CSS in globals.css."

**AI Generated:**
- All 4 page components
- `globals.css` with complete design system
- `api.ts` client with all typed interfaces
- `layout.tsx` with sidebar nav + auth guard

**Manually refined:**
- Color palette tweaked (accent blue tone)
- Added setup guide card on dashboard
- Empty state messages made more helpful

---

## Phase 6 — Docker + Deployment

**Prompt:**
> "Write a docker-compose.yml for: postgres:15, an Express backend, a Next.js frontend. Include health checks on postgres, proper depends_on, volume for postgres data, and auto-run schema.sql on init."

**AI Generated:** `docker-compose.yml` with health checks and volume mounts

---

## Summary: AI vs Manual

| Component | AI Generated | Manual Work |
|-----------|-------------|-------------|
| Database schema | 90% | Reviewed constraints, confirmed types |
| Express routes | 85% | Added extra classification rules |
| Auth middleware | 100% | — |
| Chrome extension | 80% | Added noise reduction, restart-on-flush |
| Desktop tracker | 85% | Verified ESM, added min duration |
| Frontend pages | 80% | Color tweaks, empty states, copy |
| CSS design system | 75% | Typography/spacing adjustments |
| Docker config | 90% | — |
| README | 70% | Added deployment specifics |

**Total development time with AI assistance:** ~1.5 days
**Estimated time without AI:** ~4-5 days

---

## Key AI Observations

1. **Architecture first pays off** — asking for a full plan before writing code avoided contradictions between layers.

2. **Type specificity matters** — asking for "TypeScript interfaces for all API responses" upfront made the frontend much smoother to write.

3. **AI misses edge cases** — the Chrome extension initially didn't handle browser-losing-focus correctly. Had to prompt again specifically for `windows.onFocusChanged`.

4. **Suggestion logic needed iteration** — first version only had 4 categories. Second prompt adding specific legal domains (Westlaw, PACER, Casetext) made it meaningfully useful.

5. **CSS design systems work well** — giving a specific aesthetic direction ("GitHub-dark palette, IBM Plex font, monospaced durations") produced consistent output vs asking for generic styling.

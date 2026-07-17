# LegalTrack — Billable Time Tracker

Automatic billable time tracking for legal work. Tracks browser activity via a Chrome extension, matches it to clients/matters via rules, surfaces billable suggestions for review, and auto-generates draft invoices from confirmed time. Stores everything in PostgreSQL.

> Native desktop tracking (Word/Adobe) was prototyped but is archived under `archive/` — see `archive/README.md`. v1 is browser-only.

## Stack
- **Frontend**: Next.js 15 (App Router, TypeScript)
- **Backend**: Express.js + PostgreSQL (pg)
- **Auth**: JWT (web) + one-time pairing codes (extension)
- **Tracker**: Chrome Extension (MV3)
- **Email**: Resend (draft-bill-ready notifications)
- **Deploy**: Railway

---

## Quick Start (Local)

### Prerequisites
- Docker + Docker Compose
- Node.js 20+

### 1. Clone & setup
```bash
git clone <repo-url>
cd billable-tracker
cp backend/.env.example backend/.env
```

### 2. Start everything with Docker
```bash
docker-compose up --build
```

This starts:
- PostgreSQL on port 5432 (auto-runs schema.sql)
- Backend API on http://localhost:4000
- Frontend on http://localhost:3000

### 3. Login
Go to http://localhost:3000/login
- Demo user: `demo@legaltrack.com` / `demo1234`

---

## Chrome Extension Setup
1. Open `chrome://extensions`
2. Enable **Developer mode** (top right toggle)
3. Click **Load unpacked** → select the `/extension` folder
4. Log into the web app → **Extension** (sidebar) → generate a pairing code
5. Click the extension icon → enter the pairing code → Pair Extension
6. (Optional) set the API URL in the popup if the backend isn't on `localhost:4000`

The extension auto-sends activity every 60 seconds. Pairing codes expire after 5 minutes.

---

## API Reference

## API Reference

| Method | Endpoint | Auth | Description |
|------|------|------|------|
| POST | /api/auth/register | - | Register user |
| POST | /api/auth/login | - | Login → JWT |
| GET | /api/auth/me | ✓ | Get current user |
| POST | /api/activities | ✓ | Ingest single activity |
| POST | /api/activities/batch | ✓ | Ingest batch activities |
| GET | /api/activities | ✓ | List activities |
| GET | /api/activities/stats | ✓ | Daily activity summary |
| POST | /api/entries | ✓ | Create manual entry |
| GET | /api/entries | ✓ | List time entries |
| GET | /api/entries/:id | ✓ | Get single entry |
| PUT | /api/entries/:id | ✓ | Update entry |
| DELETE | /api/entries/:id | ✓ | Delete entry |
| POST | /api/suggestions/generate | ✓ | Generate suggestions |
| GET | /api/suggestions | ✓ | List suggestions |
| PATCH | /api/suggestions/:id/accept | ✓ | Accept suggestion |
| PATCH | /api/suggestions/:id/dismiss | ✓ | Dismiss suggestion |
| POST | /api/bills/generate | ✓ | Generate a draft bill from unbilled entries |
| POST | /api/auth/pair/start | ✓ | Generate an extension pairing code |
| POST | /api/auth/pair/exchange | - | Exchange a pairing code for a JWT |

---

## Deploy for free (Vercel + Render + Neon)

No credit card, no trial expiry. Three services, three providers:

| Layer | Provider | Why |
|---|---|---|
| Frontend | [Vercel](https://vercel.com) | Built for Next.js, zero-config, free forever |
| Backend | [Render](https://render.com) | Free Docker web service (sleeps after 15 min idle, cold-starts on next request) |
| Database | [Neon](https://neon.tech) | Serverless Postgres, free tier, auto-suspends/resumes transparently |

### 1. Database — Neon
1. Create a project at neon.tech → copy the connection string it gives you (includes `?sslmode=require`, which `backend/src/db/pool.js` already expects in production).
2. Run the schema and migrations against it **in order**, from the repo root:
   ```
   psql "<neon-connection-string>" -f schema.sql
   psql "<neon-connection-string>" -f migration_v2.sql
   psql "<neon-connection-string>" -f migration_v3.sql
   psql "<neon-connection-string>" -f migration_v4.sql
   ```
   (`db_migration.sql` is a legacy file superseded by `schema.sql` — don't run it.)

### 2. Backend — Render
1. Render dashboard → New → **Blueprint** → point at this repo (uses `render.yaml` at the repo root — root dir `backend`, builds `backend/Dockerfile`, health check `/api/health`).
2. Fill in the env vars it prompts for (all marked `sync: false` in `render.yaml`, i.e. not stored in the repo): `DATABASE_URL` (from Neon), `JWT_SECRET` (generate with `openssl rand -base64 32` — not the example placeholder), `FRONTEND_URL` (fill in after step 3), `RESEND_API_KEY` / `EMAIL_FROM` (optional, for email), `INTERNAL_CRON_SECRET` (generate the same way as `JWT_SECRET`).
3. Copy the resulting `*.onrender.com` URL.

### 3. Frontend — Vercel
1. Vercel dashboard → New Project → import this repo → set **Root Directory** to `frontend`.
2. Add env var `NEXT_PUBLIC_API_URL` = the Render backend URL from step 2. Vercel treats this correctly as a build-time variable automatically (unlike a raw Docker build, where this is easy to get wrong).
3. Deploy. Copy the resulting `*.vercel.app` URL, then go back to Render and set the backend's `FRONTEND_URL` to it (needed for CORS) — this redeploys the backend.

### 4. Auto-billing (monthly cron)
Render's free tier sleeps when idle, so the backend can't run its own internal timer reliably. Instead, `.github/workflows/auto-billing.yml` runs on a schedule and pings a protected endpoint — the request itself both wakes the service and triggers the job.
1. In this repo: Settings → Secrets and variables → Actions → add `BACKEND_URL` (the Render URL) and `INTERNAL_CRON_SECRET` (must match the value set on Render in step 2).
2. That's it — it fires on the 1st of each month, or trigger it manually anytime from the Actions tab (`workflow_dispatch`).

### 5. Verify
- `<backend-url>/api/health` → 200
- `<backend-url>/api-docs` → Swagger UI loads
- Register/log in on the Vercel URL, check the browser Network tab hits the Render URL (not `localhost:4000`)
- Actions tab → manually run "Monthly auto-billing trigger" once to confirm the internal endpoint responds `200`

---

## Database Schema

```
users               → id, email, name, password_hash
tracked_activities  → id, user_id, source_type, app_name, window_title,
                      domain, file_name, url, start_time, end_time, duration_seconds
manual_entries      → id, user_id, client, matter, description,
                      date, duration_minutes, source_type, notes
billable_suggestions → id, user_id, activity_id, description, category,
                       app_name, domain, duration_minutes, date, status
```

---

## Suggestion Classification Logic

The backend classifies activities using keyword rules:

| Pattern | Category |
|---------|----------|
| westlaw.com, lexis.com, casetext.com | Legal Research |
| pacer.gov, ecf.* | Court Filing |
| .pdf in title/filename | Document Review |
| Word + motion/brief/contract | Drafting |
| Outlook, gmail | Client Communication |
| Teams, Zoom | Client Meeting |

---

## Project Structure
```
billable-tracker/
├── backend/src/
│   ├── index.js           # Express app
│   ├── db/pool.js         # PostgreSQL pool
│   ├── middleware/auth.js # JWT middleware
│   └── routes/
│       ├── auth.js        # Login/register
│       ├── activities.js  # Track events
│       ├── entries.js     # CRUD entries
│       └── suggestions.js # AI suggestions
├── frontend/src/app/
│   ├── page.tsx           # Dashboard
│   ├── activities/        # Timeline
│   ├── entries/           # CRUD UI
│   ├── suggestions/       # Suggestions UI
│   └── login|register/    # Auth
├── extension/             # Chrome MV3 extension
├── archive/               # Unmaintained prior attempts (Electron app, CLI tracker)
├── schema.sql             # PostgreSQL schema (+ migration_v2.sql, migration_v3.sql)
└── docker-compose.yml     # Local dev
```

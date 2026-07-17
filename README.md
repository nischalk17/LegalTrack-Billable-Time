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

## Deploy to Railway (Free)

1. Push code to GitHub
2. Go to [railway.app](https://railway.app) → New Project
3. Add **PostgreSQL** plugin → copy `DATABASE_URL`
4. Deploy **backend** service:
   - Root dir: `/backend`
   - Set env vars: `DATABASE_URL`, `JWT_SECRET`, `FRONTEND_URL`
5. Deploy **frontend** service:
   - Root dir: `/frontend`
   - Set env: `NEXT_PUBLIC_API_URL` = backend Railway URL
6. Run schema: connect to Railway DB and run `schema.sql`

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

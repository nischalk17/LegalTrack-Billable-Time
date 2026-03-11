# LegalTrack — Billable Time Tracker MVP

Automatic billable time tracking for legal work. Tracks browser activity (Chrome extension) + desktop applications (Windows), stores in PostgreSQL, and surfaces billable suggestions.

## Stack
- **Frontend**: Next.js 14 (App Router, TypeScript)
- **Backend**: Express.js + PostgreSQL (pg)
- **Auth**: JWT
- **Trackers**: Chrome Extension (MV3) + Node.js desktop agent (active-win)
- **Deploy**: Railway (free tier)

---

## Quick Start (Local)

### Prerequisites
- Docker + Docker Compose
- Node.js 20+
- Windows (for desktop tracker)

### 1. Clone & setup
```bash
git clone <repo-url>
cd billable-tracker
cp backend/.env.example backend/.env
cp tracker/.env.example tracker/.env
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
4. Click the extension icon
5. Paste your JWT token (from browser DevTools → Application → Local Storage → `auth_token`)

The extension auto-sends activity every 60 seconds.

---

## Desktop Tracker Setup (Windows)
```bash
cd tracker
npm install
cp .env.example .env
# Edit .env and paste your JWT token in AUTH_TOKEN
npm start
```

The tracker polls every 10 seconds and flushes every 60 seconds.

---

## API Reference

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/auth/register | - | Register user |
| POST | /api/auth/login | - | Login → JWT |
| GET | /api/auth/me | ✓ | Get current user |
| POST | /api/activities | ✓ | Ingest single activity |
| POST | /api/activities/batch | ✓ | Ingest batch activities |
| GET | /api/activities | ✓ | List activities (filterable) |
| GET | /api/activities/stats | ✓ | Daily stats summary |
| POST | /api/entries | ✓ | Create manual entry |
| GET | /api/entries | ✓ | List entries |
| PUT | /api/entries/:id | ✓ | Update entry |
| DELETE | /api/entries/:id | ✓ | Delete entry |
| POST | /api/suggestions/generate | ✓ | Generate from activities |
| GET | /api/suggestions | ✓ | List suggestions |
| PATCH | /api/suggestions/:id/accept | ✓ | Accept → create entry |
| PATCH | /api/suggestions/:id/dismiss | ✓ | Dismiss suggestion |

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
├── tracker/               # Windows desktop tracker
├── schema.sql             # PostgreSQL schema
└── docker-compose.yml     # Local dev
```

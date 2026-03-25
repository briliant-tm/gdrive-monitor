# 📁 Google Drive Monitor

> Stateless, production-ready Google Drive file change detection.
> Stack: Next.js 14 · Supabase · NextAuth · Vercel

---

## Quick Start (Localhost)

```bash
# 1. Install
npm install

# 2. Copy env
cp .env.example .env.local
# → fill in values (see Setup below)

# 3. Run
npm run dev
# → open http://localhost:3000
```
## Donate
[Saweria](https://saweria.co/AviL)
---

## Setup Guide

### Step 1 — Google Cloud (OAuth + Service Account)

**OAuth (for user login):**
1. Go to [console.cloud.google.com](https://console.cloud.google.com) → APIs & Services → Credentials
2. Enable **Google Drive API**
3. Create **OAuth 2.0 Client ID** (Web application)
4. Add Authorized Redirect URIs:
   - `http://localhost:3000/api/auth/callback/google`
   - `https://your-app.vercel.app/api/auth/callback/google`
5. Copy Client ID and Client Secret → `.env.local`

**Service Account (for cron scans):**
1. Go to **IAM & Admin → Service Accounts → Create**
2. Download JSON key file
3. In Google Drive, **share your target folder** with the service account email (role: Viewer)
4. Paste entire JSON key content as `GOOGLE_SERVICE_ACCOUNT_JSON` in `.env.local`

---

### Step 2 — Supabase

1. Create project at [supabase.com](https://supabase.com)
2. Go to **SQL Editor** → run:

```sql
-- Files table
CREATE TABLE files (
  file_id       TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  folder_id     TEXT NOT NULL,
  mime_type     TEXT NOT NULL,
  last_modified TIMESTAMPTZ NOT NULL,
  checksum      TEXT,
  size          BIGINT,
  version       INTEGER,
  last_seen     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at    TIMESTAMPTZ
);

-- Scan jobs table
CREATE TABLE scan_jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status      TEXT NOT NULL CHECK (status IN ('running', 'done', 'failed')),
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_files_folder_id  ON files (folder_id);
CREATE INDEX idx_files_deleted_at ON files (deleted_at);
CREATE INDEX idx_files_last_seen  ON files (last_seen DESC);
CREATE INDEX idx_scan_jobs_status ON scan_jobs (status);
```

3. Copy URL, anon key, service role key → Settings → API

---

### Step 3 — Fill `.env.local`

```bash
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=           # openssl rand -base64 32
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_SERVICE_ACCOUNT_JSON=   # paste full JSON on one line
DRIVE_FOLDER_ID=               # from Drive URL
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
DISCORD_WEBHOOK_URL=           # optional
TELEGRAM_BOT_TOKEN=            # optional
TELEGRAM_CHAT_ID=              # optional
CRON_SECRET=                   # openssl rand -hex 32
```

---

### Step 4 — Deploy to Vercel

```bash
npx vercel --prod
```

In **Vercel Dashboard → Settings → Environment Variables**, add all `.env.local` values.

Cron is pre-configured in `vercel.json` to run every 15 minutes.

---

## Architecture

```
Browser
  │  sign in (Google OAuth)
  ▼
NextAuth ──────────────────────── Google OAuth
  │
  ├── /dashboard         (protected by middleware.ts)
  │
  ├── POST /api/scan
  │     ├── user session? → use OAuth access token
  │     ├── X-Cron-Secret? → use Service Account token
  │     ├── BFS traverse Drive folder
  │     ├── O(n) diff vs Supabase
  │     ├── batch insert / upsert / soft-delete
  │     └── notify Discord / Telegram
  │
  ├── GET /api/files      (paginated, filtered)
  │
  └── GET /api/cron       (Vercel Cron → calls /api/scan)
```

---

## How It Works

### BFS Folder Traversal (`lib/drive.ts`)
- Starts at `DRIVE_FOLDER_ID`
- Any subfolder (mimeType = `application/vnd.google-apps.folder`) gets enqueued
- Fetches 1000 files per request, handles `nextPageToken` pagination
- Returns flat list of all files across all depths

### O(n) Diff Engine (`lib/diff.ts`)
```
Load DB files → Map<file_id, record>

For each API file:
  NOT in map  → NEW   → insert
  In map + changed → UPDATED → upsert
  In map + same    → last_seen update only

Remaining map entries (not seen in API) → DELETED → soft-delete
```

### Checksum Strategy
Priority order:
1. `md5Checksum` (binary files — Google provides this)
2. `modifiedTime + size + version` (Google Docs/Sheets/Slides — no md5)

### Concurrency Control
- Checks `scan_jobs` for `status = running` before starting
- Auto-recovers stale jobs stuck >10 minutes
- One scan at a time guaranteed

---

## API Reference

### `POST /api/scan`
Trigger a full scan. Requires authenticated session or `X-Cron-Secret` header.

```json
// Response
{
  "success": true,
  "summary": {
    "new": 5,
    "updated": 2,
    "deleted": 1,
    "total_scanned": 412,
    "duration_ms": 3200,
    "job_id": "uuid"
  },
  "changes": [ { "type": "NEW|UPDATED|DELETED", "file": {} } ]
}
```

### `GET /api/files`
```
?filter=active|deleted|all   default: active
?page=1
?page_size=50                max: 200
?search=filename
```

---

## Project Structure

```
├── app/
│   ├── api/
│   │   ├── auth/[...nextauth]/route.ts   NextAuth handler
│   │   ├── scan/route.ts                 POST: scan trigger
│   │   ├── files/route.ts                GET: file list
│   │   └── cron/route.ts                 GET: Vercel Cron
│   ├── dashboard/page.tsx                UI
│   ├── page.tsx                          Login
│   ├── layout.tsx + providers.tsx
│   └── globals.css
├── lib/
│   ├── auth.ts                           NextAuth + token refresh
│   ├── drive.ts                          Drive API + BFS + retry
│   ├── diff.ts                           Diff engine + batch DB
│   ├── service-account.ts               Google Service Account JWT
│   ├── notify.ts                         Discord + Telegram
│   └── supabase.ts
├── types/index.ts
├── middleware.ts                         Route protection
├── vercel.json                           Cron config
└── .env.example
```

---

## Notification Format

Sent only when changes are detected:

```
📁 Google Drive Update (Job: a1b2c3d4)
🟢 +5 file baru
🟡 ~2 file diubah
🔴 -1 file dihapus
📊 Total dipindai: 412 file
⏱️ Durasi: 3.20s
```

---

## License
MIT

-- supabase/migrations/001_initial.sql
-- Run this in Supabase SQL editor

-- Files table
CREATE TABLE IF NOT EXISTS files (
  file_id     TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  folder_id   TEXT NOT NULL,
  mime_type   TEXT NOT NULL,
  last_modified TIMESTAMPTZ NOT NULL,
  checksum    TEXT,
  size        BIGINT,
  version     INTEGER,
  last_seen   TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at  TIMESTAMPTZ
);

-- Scan jobs table
CREATE TABLE IF NOT EXISTS scan_jobs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status      TEXT NOT NULL CHECK (status IN ('running', 'done', 'failed')),
  started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_files_folder_id   ON files (folder_id);
CREATE INDEX IF NOT EXISTS idx_files_deleted_at  ON files (deleted_at);
CREATE INDEX IF NOT EXISTS idx_files_last_seen   ON files (last_seen DESC);
CREATE INDEX IF NOT EXISTS idx_scan_jobs_status  ON scan_jobs (status);

-- RLS: allow service role full access (disable RLS or use service key)
ALTER TABLE files     ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_jobs ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS automatically in Supabase.
-- If you need anon reads for the dashboard, add policies:
-- CREATE POLICY "allow_read" ON files FOR SELECT USING (true);
-- CREATE POLICY "allow_read" ON scan_jobs FOR SELECT USING (true);

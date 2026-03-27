CREATE TABLE IF NOT EXISTS scripts (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  tags        TEXT NOT NULL DEFAULT '[]',
  platforms   TEXT NOT NULL DEFAULT '{}',
  params      TEXT NOT NULL DEFAULT '[]',
  created_at  TEXT NOT NULL,
  updated_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scheduled_tasks (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  script_id   TEXT NOT NULL,
  cron        TEXT NOT NULL,
  enabled     INTEGER NOT NULL DEFAULT 1,
  params      TEXT NOT NULL DEFAULT '{}',
  last_run_at TEXT,
  last_status TEXT,
  created_at  TEXT NOT NULL,
  FOREIGN KEY (script_id) REFERENCES scripts(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS execution_logs (
  id          TEXT PRIMARY KEY,
  script_id   TEXT,
  task_id     TEXT,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  exit_code   INTEGER,
  output      TEXT NOT NULL DEFAULT '',
  params      TEXT NOT NULL DEFAULT '{}',
  spawn_pid   INTEGER
);

CREATE TABLE IF NOT EXISTS cheatsheet_entries (
  id          TEXT PRIMARY KEY,
  category    TEXT NOT NULL,
  command     TEXT NOT NULL,
  description TEXT NOT NULL,
  tags        TEXT NOT NULL DEFAULT '[]',
  platform    TEXT NOT NULL DEFAULT 'all',
  is_builtin  INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS snippets (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  content     TEXT NOT NULL,
  language    TEXT NOT NULL DEFAULT 'text',
  tags        TEXT NOT NULL DEFAULT '[]',
  created_at  TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_scripts_name ON scripts(name);
CREATE INDEX IF NOT EXISTS idx_cheatsheet_category ON cheatsheet_entries(category);
CREATE INDEX IF NOT EXISTS idx_logs_script_id ON execution_logs(script_id);
CREATE INDEX IF NOT EXISTS idx_logs_started_at ON execution_logs(started_at);

CREATE TABLE IF NOT EXISTS app_settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

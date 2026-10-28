PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS partners (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE COLLATE NOCASE,
  destination_url TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS click_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  partner_id INTEGER NOT NULL REFERENCES partners(id) ON DELETE CASCADE,
  occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS click_events_partner_occurred_at ON click_events (partner_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS click_events_occurred_at ON click_events (occurred_at DESC);

-- Initial verified partner link requested for ANIMA's shared professional folder.
INSERT OR IGNORE INTO partners (name, slug, destination_url, active, created_at, updated_at)
VALUES (
  'Silverplaque',
  'silverplaque',
  'https://drive.google.com/drive/folders/1IlXLQ8RZD3v7hT72HBTFpgBzTnljKn0w',
  1,
  datetime('now'),
  datetime('now')
);

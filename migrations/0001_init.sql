-- Plan Zmian — Cloudflare D1 schema (phase 1, read-only API)
-- schedule_id is always 'gillette' for now (see ADMIN_BACKEND_SPEC 13.5).
CREATE TABLE schedule_years (
  schedule_id TEXT NOT NULL,
  year        INTEGER NOT NULL,
  data_json   TEXT NOT NULL,   -- { "1": {"A":[...],"B":[...],"C":[...],"D":[...]}, ... "12": {...} }
  hours_json  TEXT NOT NULL,   -- { "1": {"A":168,...}, ... }
  revision    INTEGER NOT NULL,
  updated_at  TEXT NOT NULL,   -- ISO UTC
  updated_by  TEXT NOT NULL,   -- email адміна
  PRIMARY KEY (schedule_id, year)
);

CREATE TABLE schedule_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id TEXT NOT NULL,
  year        INTEGER NOT NULL,
  revision    INTEGER NOT NULL,
  data_json   TEXT NOT NULL,
  hours_json  TEXT NOT NULL,
  saved_at    TEXT NOT NULL,
  saved_by    TEXT NOT NULL
);
CREATE INDEX idx_history_year ON schedule_history (schedule_id, year, revision DESC);

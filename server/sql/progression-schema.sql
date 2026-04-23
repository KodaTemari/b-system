CREATE TABLE IF NOT EXISTS matches (
  event_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  court_id TEXT NOT NULL,
  red_player_id TEXT NOT NULL,
  blue_player_id TEXT NOT NULL,
  scheduled_at TEXT,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (
    status IN ('scheduled', 'announced', 'in_progress', 'court_approved', 'hq_approved', 'reflected')
  ),
  warmup_started_at TEXT,
  warmup_finished_at TEXT,
  started_at TEXT,
  court_approved_at TEXT,
  court_referee_name TEXT,
  hq_approved_at TEXT,
  hq_approver_name TEXT,
  reflected_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (event_id, match_id)
);

CREATE TABLE IF NOT EXISTS results (
  event_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  red_score INTEGER,
  blue_score INTEGER,
  winner_player_id TEXT,
  is_correction INTEGER NOT NULL DEFAULT 0,
  correction_reason TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (event_id, match_id),
  FOREIGN KEY (event_id, match_id) REFERENCES matches(event_id, match_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS approvals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL,
  match_id TEXT NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('court', 'hq')),
  approver_name TEXT NOT NULL,
  approved_at TEXT NOT NULL,
  meta_json TEXT,
  FOREIGN KEY (event_id, match_id) REFERENCES matches(event_id, match_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS active_locks (
  event_id TEXT NOT NULL,
  lock_type TEXT NOT NULL CHECK (lock_type IN ('match', 'player')),
  lock_key TEXT NOT NULL,
  match_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (event_id, lock_type, lock_key),
  FOREIGN KEY (event_id, match_id) REFERENCES matches(event_id, match_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_matches_event_status ON matches(event_id, status);
CREATE INDEX IF NOT EXISTS idx_matches_event_schedule ON matches(event_id, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_results_event_match ON results(event_id, match_id);
CREATE INDEX IF NOT EXISTS idx_approvals_event_match ON approvals(event_id, match_id);
CREATE INDEX IF NOT EXISTS idx_active_locks_event_match ON active_locks(event_id, match_id);

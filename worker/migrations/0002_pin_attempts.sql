CREATE TABLE IF NOT EXISTS pin_attempts (
  client_key TEXT PRIMARY KEY,
  failures INTEGER NOT NULL,
  window_started INTEGER NOT NULL,
  blocked_until INTEGER NOT NULL DEFAULT 0
);

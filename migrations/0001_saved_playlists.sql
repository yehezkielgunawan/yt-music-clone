CREATE TABLE playlists (
  id TEXT PRIMARY KEY NOT NULL,
  owner_id TEXT NOT NULL,
  name TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 100),
  entries_json TEXT NOT NULL CHECK (json_valid(entries_json) AND json_type(entries_json) = 'array' AND json_array_length(entries_json) <= 50),
  revision INTEGER NOT NULL DEFAULT 1 CHECK (revision >= 1),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX playlists_owner_updated ON playlists (owner_id, updated_at DESC, id);

CREATE TABLE playlist_shares (
  playlist_id TEXT PRIMARY KEY NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL,
  token TEXT UNIQUE,
  name TEXT NOT NULL,
  entries_json TEXT NOT NULL CHECK (json_valid(entries_json) AND json_type(entries_json) = 'array' AND json_array_length(entries_json) <= 50),
  source_revision INTEGER NOT NULL CHECK (source_revision >= 1),
  version INTEGER NOT NULL CHECK (version >= 1),
  published_at TEXT NOT NULL,
  operation_id TEXT NOT NULL,
  operation_kind TEXT NOT NULL CHECK (operation_kind IN ('publish', 'replace', 'revoke'))
);

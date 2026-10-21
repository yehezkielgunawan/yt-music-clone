import type { Playlist, PlaylistDraft, PlaylistSummary } from './types'
import { parsePlaylist } from './validation'

// The subset of the D1 binding used here; also exercised against SQLite in unit tests.
export interface LibraryDatabase {
  prepare(sql: string): {
    bind(...values: (string | number)[]): {
      first<Row>(): Promise<Row | null>
      all<Row>(): Promise<{ results: Row[] }>
    }
  }
}

interface Row {
  id: string
  name: string
  entries_json: string
  revision: number
  created_at: string
  updated_at: string
}
function playlist(row: Row): Playlist {
  return {
    ...parsePlaylist({ name: row.name, entries: JSON.parse(row.entries_json) }),
    id: row.id,
    revision: row.revision,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export class PlaylistRepository {
  constructor(
    private db: LibraryDatabase,
    private owner: string,
  ) {}

  async list(): Promise<PlaylistSummary[]> {
    const { results } = await this.db
      .prepare(
        'SELECT id, name, revision, updated_at, json_array_length(entries_json) AS track_count FROM playlists WHERE owner_id = ? ORDER BY updated_at DESC, id',
      )
      .bind(this.owner)
      .all<{
        id: string
        name: string
        revision: number
        updated_at: string
        track_count: number
      }>()
    return results.map((row) => ({
      id: row.id,
      name: row.name,
      revision: row.revision,
      updatedAt: row.updated_at,
      trackCount: row.track_count,
    }))
  }

  async get(id: string): Promise<Playlist | null> {
    const row = await this.db
      .prepare('SELECT * FROM playlists WHERE id = ? AND owner_id = ?')
      .bind(id, this.owner)
      .first<Row>()
    return row ? playlist(row) : null
  }

  async create(id: string, draft: PlaylistDraft): Promise<Playlist | null> {
    const now = new Date().toISOString()
    const row = await this.db
      .prepare(
        'INSERT INTO playlists (id, owner_id, name, entries_json, revision, created_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?) ON CONFLICT(id) DO NOTHING RETURNING *',
      )
      .bind(id, this.owner, draft.name, JSON.stringify(draft.entries), now, now)
      .first<Row>()
    if (row) return playlist(row)
    const existing = await this.get(id)
    // A repeated create can acknowledge a lost response, but must never overwrite data.
    return existing &&
      existing.name === draft.name &&
      JSON.stringify(existing.entries) === JSON.stringify(draft.entries)
      ? existing
      : null
  }

  async update(
    id: string,
    revision: number,
    draft: PlaylistDraft,
  ): Promise<Playlist | null> {
    const row = await this.db
      .prepare(
        'UPDATE playlists SET name = ?, entries_json = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND owner_id = ? AND revision = ? RETURNING *',
      )
      .bind(
        draft.name,
        JSON.stringify(draft.entries),
        new Date().toISOString(),
        id,
        this.owner,
        revision,
      )
      .first<Row>()
    return row ? playlist(row) : null
  }

  async delete(id: string, revision: number): Promise<boolean> {
    const row = await this.db
      .prepare(
        'DELETE FROM playlists WHERE id = ? AND owner_id = ? AND revision = ? RETURNING id',
      )
      .bind(id, this.owner, revision)
      .first<{ id: string }>()
    return row !== null
  }
}

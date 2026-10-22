import type { LibraryDatabase } from '../library/repository'
import { parsePlaylist } from '../library/validation'
import type { PlaylistDraft } from '../library/types'
import type { PublishMutation, ShareMutation, ShareStatus } from './types'

interface ShareRow {
  token: string | null
  name: string
  entries_json: string
  source_revision: number
  version: number
  published_at: string
  operation_id: string
  operation_kind: string
}

function status(row: ShareRow): ShareStatus {
  return {
    path: row.token ? `/s/${row.token}` : null,
    version: row.version,
    sourceRevision: row.source_revision,
    publishedAt: row.published_at,
  }
}

export class ShareRepository {
  constructor(
    private db: LibraryDatabase,
    private owner: string,
  ) {}

  private row(id: string) {
    return this.db
      .prepare(
        'SELECT s.* FROM playlist_shares s JOIN playlists p ON p.id = s.playlist_id AND p.owner_id = s.owner_id WHERE s.playlist_id = ? AND s.owner_id = ?',
      )
      .bind(id, this.owner)
      .first<ShareRow>()
  }

  async status(id: string): Promise<ShareStatus | null> {
    const row = await this.row(id)
    return row ? status(row) : null
  }

  async publicSnapshot(token: string): Promise<PlaylistDraft | null> {
    const row = await this.db
      .prepare(
        'SELECT s.name, s.entries_json FROM playlist_shares s JOIN playlists p ON p.id = s.playlist_id AND p.owner_id = s.owner_id WHERE s.token = ?',
      )
      .bind(token)
      .first<Pick<ShareRow, 'name' | 'entries_json'>>()
    return row
      ? parsePlaylist({ name: row.name, entries: JSON.parse(row.entries_json) })
      : null
  }

  async publish(
    id: string,
    input: PublishMutation,
    replace: boolean,
  ): Promise<ShareStatus | null> {
    const kind = replace ? 'replace' : 'publish'
    // A fresh token is generated server-side, never accepted from the caller.
    const token = Array.from(
      crypto.getRandomValues(new Uint8Array(32)),
      (byte) => byte.toString(16).padStart(2, '0'),
    ).join('')
    const row = await this.db
      .prepare(
        `
      INSERT INTO playlist_shares (playlist_id, owner_id, token, name, entries_json, source_revision, version, published_at, operation_id, operation_kind)
      SELECT id, owner_id, ?, name, entries_json, revision, 1, ?, ?, ? FROM playlists
      WHERE id = ? AND owner_id = ? AND revision = ? AND ((? = 0 AND ? = 0) OR EXISTS (SELECT 1 FROM playlist_shares WHERE playlist_id = ?))
      ON CONFLICT(playlist_id) DO UPDATE SET token = excluded.token, name = excluded.name,
        entries_json = excluded.entries_json, source_revision = excluded.source_revision,
        version = playlist_shares.version + 1, published_at = excluded.published_at,
        operation_id = excluded.operation_id, operation_kind = excluded.operation_kind
      WHERE playlist_shares.owner_id = excluded.owner_id AND playlist_shares.version = ?
        AND playlist_shares.operation_id != excluded.operation_id
        AND ((? = 1 AND playlist_shares.token IS NOT NULL) OR (? = 0 AND playlist_shares.token IS NULL))
      RETURNING *
    `,
      )
      .bind(
        token,
        new Date().toISOString(),
        input.operationId,
        kind,
        id,
        this.owner,
        input.revision,
        input.version,
        replace ? 1 : 0,
        id,
        input.version,
        replace ? 1 : 0,
        replace ? 1 : 0,
      )
      .first<ShareRow>()
    if (row) return status(row)
    // Only the immediately preceding identical operation can acknowledge a lost response.
    const previous = await this.row(id)
    return previous &&
      previous.operation_id === input.operationId &&
      previous.operation_kind === kind &&
      previous.version === input.version + 1 &&
      previous.source_revision === input.revision
      ? status(previous)
      : null
  }

  async revoke(id: string, input: ShareMutation): Promise<ShareStatus | null> {
    // Keep a tombstone version so old publish requests cannot resurrect a revoked link.
    const row = await this.db
      .prepare(
        `UPDATE playlist_shares SET token = NULL, name = '', entries_json = '[]',
      version = version + 1, operation_id = ?, operation_kind = 'revoke'
      WHERE playlist_id = ? AND owner_id = ? AND version = ? AND token IS NOT NULL
        AND operation_id != ? RETURNING *`,
      )
      .bind(input.operationId, id, this.owner, input.version, input.operationId)
      .first<ShareRow>()
    if (row) return status(row)
    const previous = await this.row(id)
    return previous &&
      previous.operation_id === input.operationId &&
      previous.operation_kind === 'revoke' &&
      previous.version === input.version + 1
      ? status(previous)
      : null
  }
}

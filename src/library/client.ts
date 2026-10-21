/// <reference lib="dom" />
import type { Playlist, PlaylistDraft, PlaylistSummary } from './types'

export class LibraryError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message)
  }
}

async function request<T>(
  path = '',
  method = 'GET',
  data?: unknown,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api/playlists${path}`, {
      method,
      credentials: 'same-origin',
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
      ...(data === undefined
        ? {}
        : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
          }),
    })
  } catch {
    throw new LibraryError(
      'Could not reach your library. Your draft is still here; check your connection and retry.',
      0,
    )
  }
  if (response.status === 401)
    throw new LibraryError(
      'Your session expired. Sign in to access your library. Your draft remains here while this page stays open.',
      401,
    )
  const body = await response.json().catch(() => null)
  if (!response.ok)
    throw new LibraryError(
      body &&
        typeof body === 'object' &&
        'error' in body &&
        typeof body.error === 'string'
        ? body.error
        : 'Could not complete the library request. Please retry.',
      response.status,
    )
  return body as T
}

export const libraryClient = {
  list: () => request<{ playlists: PlaylistSummary[] }>(),
  get: (id: string) => request<{ playlist: Playlist }>(`/${id}`),
  create: (id: string, draft: PlaylistDraft) =>
    request<{ playlist: Playlist }>('', 'POST', { id, ...draft }),
  save: (id: string, revision: number, draft: PlaylistDraft) =>
    request<{ playlist: Playlist }>(`/${id}`, 'PUT', { ...draft, revision }),
  delete: (id: string, revision: number) =>
    request<{ deleted: boolean }>(`/${id}`, 'DELETE', { revision }),
}

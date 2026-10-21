export interface PlaylistEntry {
  id: string
  videoId: string
  label: string | null
  title?: string | null
  author?: string | null
  album?: string | null
}

export interface PlaylistDraft {
  name: string
  entries: PlaylistEntry[]
}

export interface Playlist extends PlaylistDraft {
  id: string
  revision: number
  createdAt: string
  updatedAt: string
}

export interface PlaylistSummary {
  id: string
  name: string
  trackCount: number
  revision: number
  updatedAt: string
}

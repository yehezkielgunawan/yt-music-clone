export interface ShareStatus {
  path: string | null
  version: number
  sourceRevision: number
  publishedAt: string
}

export interface ShareMutation {
  version: number
  operationId: string
}

export interface PublishMutation extends ShareMutation {
  revision: number
}

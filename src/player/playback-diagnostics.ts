export interface DiagnosticEvent {
  at: string
  elapsedMs: number
  type: string
  detail: Record<string, string | number | boolean | null>
}

export class PlaybackDiagnostics {
  private events: DiagnosticEvent[] = []
  private startedAt = Date.now()
  private dropped = 0

  constructor(private limit = 300) {}

  record(type: string, detail: DiagnosticEvent['detail'] = {}) {
    this.events.push({
      at: new Date().toISOString(),
      elapsedMs: Date.now() - this.startedAt,
      type,
      detail: { ...detail },
    })
    if (this.events.length > this.limit) {
      this.events.shift()
      this.dropped++
    }
  }

  entries(): DiagnosticEvent[] {
    return this.events.map((event) => ({
      ...event,
      detail: { ...event.detail },
    }))
  }

  report(environment: Record<string, string | boolean | number>) {
    return {
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      environment,
      droppedEvents: this.dropped,
      events: this.entries(),
      limitation:
        'Events describe observations, not proof of continuous background playback or ad blocking. Browser suspension may delay or omit events.',
    }
  }
}

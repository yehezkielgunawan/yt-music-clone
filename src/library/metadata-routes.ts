import { Hono } from 'hono'
import type { AppEnv } from '../auth/middleware'

// Read a bounded response even when the upstream omits Content-Length.
async function readDetails(response: Response): Promise<unknown> {
  if (!response.ok || !response.body) throw new Error('Unavailable')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let bytes = 0
  let text = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bytes += value.byteLength
      if (bytes > 32768) {
        await reader.cancel()
        throw new Error('Response too large')
      }
      text += decoder.decode(value, { stream: true })
    }
    return JSON.parse(text + decoder.decode())
  } finally {
    reader.releaseLock()
  }
}

const metadata = new Hono<AppEnv>()
metadata.get('/:id', async (c) => {
  const id = c.req.param('id')
  if (!/^[A-Za-z0-9_-]{11}$/.test(id))
    return c.json({ error: 'Use a valid YouTube video ID.' }, 400)
  const url = new URL('https://www.youtube.com/oembed')
  url.searchParams.set('url', `https://www.youtube.com/watch?v=${id}`)
  url.searchParams.set('format', 'json')
  try {
    const data = await readDetails(
      await fetch(url, {
        signal: AbortSignal.timeout(8000),
        redirect: 'error',
        headers: { Accept: 'application/json' },
      }),
    )
    if (!data || typeof data !== 'object') throw new Error('Invalid metadata')
    const { title, author_name: author } = data as Record<string, unknown>
    if (
      typeof title !== 'string' ||
      !title.trim() ||
      title.trim().length > 200 ||
      typeof author !== 'string' ||
      !author.trim() ||
      author.trim().length > 200
    )
      throw new Error('Invalid metadata')
    return c.json({ title: title.trim(), author: author.trim() })
  } catch {
    return c.json({ error: 'Track details unavailable. Please retry.' }, 502)
  }
})

export { metadata }

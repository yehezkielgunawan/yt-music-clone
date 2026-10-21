const VIDEO_ID = /^[A-Za-z0-9_-]{11}$/
const HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'music.youtube.com',
])

export const DEFAULT_QUEUE = ['K4DyBUG242c', '3nQNiWdeH2Q', 'jK2aIUmmdP4']

export function parseVideoId(input: string): string {
  const value = input.trim()
  if (VIDEO_ID.test(value)) return value
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Enter a YouTube URL or an 11-character video ID.')
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password
  ) {
    throw new Error('Use a public YouTube video URL.')
  }
  let id: string | null = null
  if (url.hostname === 'youtu.be') id = url.pathname.slice(1)
  else if (HOSTS.has(url.hostname)) {
    if (url.pathname === '/watch') id = url.searchParams.get('v')
    else if (/^\/(shorts|embed|live)\//.test(url.pathname))
      id = url.pathname.split('/')[2]
  }
  if (!id && HOSTS.has(url.hostname) && url.searchParams.has('list'))
    throw new Error('Paste individual track links, not a playlist URL.')
  if (!id || !VIDEO_ID.test(id))
    throw new Error('That link is not a supported YouTube video.')
  return id
}

export function parseQueue(text: string): string[] {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
  if (!lines.length) throw new Error('Add at least one video.')
  if (lines.length > 50)
    throw new Error('Use up to 50 videos for this playback test.')
  return lines.map((line, index) => {
    try {
      return parseVideoId(line)
    } catch (error) {
      throw new Error(
        `Line ${index + 1}: ${error instanceof Error ? error.message : 'Invalid video.'}`,
      )
    }
  })
}

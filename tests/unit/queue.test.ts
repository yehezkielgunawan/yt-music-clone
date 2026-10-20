import { describe, expect, it } from 'vitest'
import { parseQueue, parseVideoId } from '../../src/player/queue'

describe('video input', () => {
  it.each([
    'jfKfPfyJRdk',
    'https://www.youtube.com/watch?v=jfKfPfyJRdk&list=example',
    'https://music.youtube.com/watch?v=jfKfPfyJRdk',
    'https://youtu.be/jfKfPfyJRdk?t=12',
    'https://www.youtube.com/shorts/jfKfPfyJRdk',
    'https://www.youtube.com/embed/jfKfPfyJRdk',
  ])('accepts a supported ID or URL: %s', (input) => {
    expect(parseVideoId(input)).toBe('jfKfPfyJRdk')
  })

  it.each([
    'https://youtube.com.evil.test/watch?v=jfKfPfyJRdk',
    'https://example.com/watch?v=jfKfPfyJRdk',
    'javascript:alert(1)',
    'https://youtube.com/watch?v=short',
    'https://youtube.com/playlist?list=abc',
    'https://user:password@youtube.com/watch?v=jfKfPfyJRdk',
  ])('rejects malformed or unrelated input: %s', (input) => {
    expect(() => parseVideoId(input)).toThrow()
  })

  it('keeps duplicate entries and their order', () => {
    expect(parseQueue('jfKfPfyJRdk\n5qap5aO4i9A\njfKfPfyJRdk')).toEqual([
      'jfKfPfyJRdk',
      '5qap5aO4i9A',
      'jfKfPfyJRdk',
    ])
  })

  it('rejects an empty, oversized, or partially invalid queue', () => {
    expect(() => parseQueue(' \n ')).toThrow()
    expect(() => parseQueue(Array(51).fill('jfKfPfyJRdk').join('\n'))).toThrow()
    expect(() => parseQueue('jfKfPfyJRdk\nnot a video')).toThrow('Line 2')
  })
})

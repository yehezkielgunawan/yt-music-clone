/** @jsxImportSource hono/jsx/dom */
const paths = {
  play: 'm9 5 11 7-11 7V5Z',
  pause: 'M8 5v14M16 5v14',
  next: 'm5 5 10 7-10 7V5ZM19 5v14',
  previous: 'm19 5-10 7 10 7V5ZM5 5v14',
  shuffle:
    'M3 7h3c5 0 7 10 12 10h3m-4-4 4 4-4 4M3 17h3c2 0 3-2 4-4m4-2c1-2 2-4 4-4h3m-4-4 4 4-4 4',
  repeat:
    'm17 2 4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4m14-1v2a3 3 0 0 1-3 3H3',
  arrow: 'M5 12h14m-6-6 6 6-6 6',
  download: 'M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4',
  plus: 'M12 5v14M5 12h14',
  check: 'm5 12 4 4L19 6',
  connection: 'M5 12a7 7 0 0 1 14 0M8 15a4 4 0 0 1 8 0M12 19h.01',
  list: 'M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01',
  close: 'm6 6 12 12M6 18 18 6',
} as const

export function Icon({
  name,
  size = 20,
}: {
  name: keyof typeof paths
  size?: number
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.7"
      stroke-linecap="round"
      stroke-linejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  )
}

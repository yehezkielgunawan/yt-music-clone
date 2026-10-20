import { jsxRenderer } from 'hono/jsx-renderer'
import { Link, Script, ViteClient } from 'vite-ssr-components/hono'

export const renderer = jsxRenderer(({ children }) => {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <meta charset="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
        <meta name="theme-color" content="#111615" />
        <meta
          name="description"
          content="Your own little listening room. A personal YouTube queue and Brave background-playback test."
        />
        <meta name="referrer" content="strict-origin-when-cross-origin" />
        <title>Side A — Your little listening room</title>
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" type="image/svg+xml" href="/icons/icon.svg" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <ViteClient />
        <Link href="/src/style.css" rel="stylesheet" />
        <Script src="/src/client.tsx" />
      </head>
      <body>{children}</body>
    </html>
  )
})

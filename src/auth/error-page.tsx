import { Link } from 'vite-ssr-components/hono'

export function AuthErrorPage({ denied }: { denied: boolean }) {
  return (
    <html lang="en" data-theme="dark">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Sign-in help — Yehezgun-music</title>
        <Link href="/src/style.css" rel="stylesheet" />
      </head>
      <body>
        <main class="min-h-dvh flex flex-col items-center justify-center gap-6 p-8 text-center">
          <p class="eyebrow">Yehezgun-music · PRIVATE LISTENING ROOM</p>
          <h1 class="text-3xl">
            {denied ? 'This room is private.' : 'Sign-in could not finish.'}
          </h1>
          <p>
            {denied
              ? 'Use the verified Google account configured by the owner.'
              : 'Please try signing in again. If this continues, check the Google OAuth and Worker configuration.'}
          </p>
          <a class="text-link" href="/api/auth/signin">
            Try Google sign-in again
          </a>
        </main>
      </body>
    </html>
  )
}

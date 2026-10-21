import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import ssrPlugin from 'vite-ssr-components/plugin'

export default defineConfig({
  plugins: [
    tailwindcss(),
    cloudflare({
      persistState: process.env.SIDE_A_TEST_STORAGE
        ? { path: process.env.SIDE_A_TEST_STORAGE }
        : true,
    }),
    ssrPlugin(),
  ],
})

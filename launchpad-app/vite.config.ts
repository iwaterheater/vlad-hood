import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // deployed beside the current launchpad, not over it, so both can be compared
  base: '/launchpad-next/',
  plugins: [react()],
  server: {
    /* The image upload and the vote tally are PHP, which Vite does not run. In
       production Apache serves them from the same origin; in development point
       them at `php -S 127.0.0.1:8899 -t .` from the repository root. */
    proxy: {
      '/votes': 'http://127.0.0.1:8899',
      '/upload': 'http://127.0.0.1:8899',
    },
  },
})

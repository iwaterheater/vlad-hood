import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // deployed beside the current launchpad, not over it, so both can be compared
  base: '/launchpad-next/',
  plugins: [react()],
})

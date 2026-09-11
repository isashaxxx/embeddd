import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { apiPlugin } from './server/vitePlugin.js'

export default defineConfig({
  plugins: [react(), apiPlugin()],
  server: {
    // Listen on the local network too, so the app opens from a phone on the same Wi-Fi.
    host: true,
    // Published share snapshots are written here at runtime.
    watch: { ignored: ['**/.data/**'] },
  },
})

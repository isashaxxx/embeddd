import type { Plugin } from 'vite'
import { sharesHandler } from './shares.js'
import { unfurlHandler } from './unfurl.js'

/** Serves the API from Vite's dev and preview servers; on Vercel the same handlers run in /api. */
export function apiPlugin(): Plugin {
  return {
    name: 'embeddd-api',
    configureServer(server) {
      server.middlewares.use(unfurlHandler)
      server.middlewares.use(sharesHandler)
    },
    configurePreviewServer(server) {
      server.middlewares.use(unfurlHandler)
      server.middlewares.use(sharesHandler)
    },
  }
}

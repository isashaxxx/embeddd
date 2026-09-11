import type { IncomingMessage, ServerResponse } from 'node:http'
import { sharesHandler } from '../server/shares.js'

export default function handler(req: IncomingMessage, res: ServerResponse) {
  // vercel.json rewrites /api/shares/<path> here as ?path=<path>; restore the original URL shape.
  const url = new URL(req.url ?? '/', 'http://local')
  const rest = url.searchParams.get('path')
  if (rest !== null) {
    url.searchParams.delete('path')
    req.url = `/api/shares/${rest}${url.search}`
  }
  return sharesHandler(req, res, () => {
    res.statusCode = 404
    res.end()
  })
}

import type { IncomingMessage, ServerResponse } from 'node:http'
import { unfurlHandler } from '../server/unfurl.js'

export default function handler(req: IncomingMessage, res: ServerResponse) {
  return unfurlHandler(req, res, () => {
    res.statusCode = 404
    res.end()
  })
}

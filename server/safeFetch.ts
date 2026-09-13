import { lookup, type LookupAddress } from 'node:dns'
import { BlockList, isIP } from 'node:net'
import { Agent, fetch, type RequestInit, type Response } from 'undici'

// Outbound requests for link previews and the image proxy take URLs from users, so they must
// never reach loopback, private networks or cloud metadata endpoints — not directly, not via a
// hostname that resolves there, and not via a redirect.

// Separate lists: Node's BlockList treats IPv4 as IPv4-mapped IPv6, so an IPv6 rule like
// ::ffff:0:0/96 in a shared list would block every IPv4 address.
const blockedV4 = new BlockList()
const blockedV6 = new BlockList()
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) {
  blockedV4.addSubnet(net, prefix, 'ipv4')
}
for (const [net, prefix] of [
  ['::', 128],
  ['::1', 128],
  // IPv4-mapped in hex form (::ffff:7f00:1); the dotted form is checked as IPv4 below.
  ['::ffff:0:0', 96],
  ['64:ff9b::', 96],
  ['100::', 64],
  ['2001:db8::', 32],
  ['fc00::', 7],
  ['fe80::', 10],
  ['ff00::', 8],
] as const) {
  blockedV6.addSubnet(net, prefix, 'ipv6')
}

export function isBlockedAddress(address: string): boolean {
  const version = isIP(address)
  if (version === 4) return blockedV4.check(address, 'ipv4')
  if (version === 6) {
    // IPv4-mapped addresses (::ffff:a.b.c.d) are judged by their IPv4 part.
    const mapped = address.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i)
    if (mapped) return blockedV4.check(mapped[1], 'ipv4')
    return blockedV6.check(address, 'ipv6')
  }
  return true
}

/** Parses and screens a URL: http(s) only, no internal hostnames or IP literals. */
export function toPublicUrl(raw: string): URL | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
  if (url.username || url.password) return null
  const host = url.hostname.replace(/^\[|\]$/g, '').replace(/\.$/, '').toLowerCase()
  if (!host || host === 'localhost' || /\.(localhost|local|internal|home|lan)$/.test(host)) return null
  if (isIP(host) && isBlockedAddress(host)) return null
  return url
}

/**
 * Every connection resolves DNS here and refuses internal addresses, which also covers
 * hostnames that point inward and DNS rebinding between check and connect.
 */
const agent = new Agent({
  connect: {
    lookup(hostname, options, callback) {
      lookup(hostname, { ...options, all: true }, (err, addresses: LookupAddress[]) => {
        if (err) return callback(err, '', 0)
        const bad = addresses.find((a) => isBlockedAddress(a.address))
        if (bad || !addresses.length) {
          return callback(Object.assign(new Error(`Blocked address for ${hostname}`), { code: 'EBLOCKED' }), '', 0)
        }
        if ((options as { all?: boolean }).all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, addresses)
        callback(null, addresses[0].address, addresses[0].family)
      })
    },
  },
})

/** fetch() for untrusted URLs: redirects are followed by hand, re-checking every hop. */
export async function safeFetch(raw: string, init: RequestInit = {}, maxRedirects = 5): Promise<{ response: Response; url: string }> {
  let current = raw
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const url = toPublicUrl(current)
    if (!url) throw new Error('Blocked URL')
    const response = await fetch(url, { ...init, redirect: 'manual', dispatcher: agent })
    const location = response.headers.get('location')
    if (response.status >= 300 && response.status < 400 && location) {
      await response.body?.cancel()
      current = new URL(location, url).toString()
      continue
    }
    return { response, url: url.toString() }
  }
  throw new Error('Too many redirects')
}

interface Env {
  MEDIA: {
    get(key: string): Promise<{
      body: ReadableStream;
      httpEtag: string;
      writeHttpMetadata(headers: Headers): void;
    } | null>;
    put(key: string, body: ReadableStream | null, options: Record<string, unknown>): Promise<unknown>;
    delete(key: string): Promise<void>;
  };
  MEDIA_SIGNING_SECRET: string;
}

const encoder = new TextEncoder();

async function signature(secret: string, method: string, key: string, expires: string) {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const bytes = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(`${method}\n${key}\n${expires}`));
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function cors(origin: string | null): Record<string, string> {
  const allowed = origin === 'https://embeddd.vercel.app' || origin === 'http://localhost:3000';
  return allowed
    ? {
        'access-control-allow-origin': origin,
        'access-control-allow-methods': 'GET, PUT, DELETE, OPTIONS',
        'access-control-allow-headers': 'content-type',
        'access-control-max-age': '3600',
        vary: 'Origin',
      }
    : {};
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const key = decodeURIComponent(url.pathname.replace(/^\//, ''));
    const headers = cors(request.headers.get('origin'));

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (!key) return new Response('embeddd media', { status: 200 });

    if (request.method === 'GET' || request.method === 'HEAD') {
      const object = await env.MEDIA.get(key);
      if (!object) return new Response('Not found', { status: 404, headers });
      const responseHeaders = new Headers(headers);
      object.writeHttpMetadata(responseHeaders);
      responseHeaders.set('etag', object.httpEtag);
      responseHeaders.set('cache-control', 'public, max-age=31536000, immutable');
      return new Response(request.method === 'HEAD' ? null : object.body, { headers: responseHeaders });
    }

    if (request.method === 'PUT' || request.method === 'DELETE') {
      const expires = url.searchParams.get('expires') || '';
      const supplied = url.searchParams.get('sig') || '';
      if (!expires || Number(expires) < Math.floor(Date.now() / 1000))
        return new Response('Expired', { status: 403, headers });
      const expected = await signature(env.MEDIA_SIGNING_SECRET, request.method, key, expires);
      if (supplied !== expected) return new Response('Forbidden', { status: 403, headers });

      if (request.method === 'DELETE') {
        await env.MEDIA.delete(key);
        return new Response(null, { status: 204, headers });
      }

      await env.MEDIA.put(key, request.body, {
        httpMetadata: {
          contentType: request.headers.get('content-type') || 'application/octet-stream',
          cacheControl: 'public, max-age=31536000, immutable',
        },
      });
      return new Response(null, { status: 201, headers });
    }

    return new Response('Method not allowed', { status: 405, headers });
  },
};

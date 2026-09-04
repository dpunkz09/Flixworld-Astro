export const prerender = false;

import type { APIRoute } from 'astro';

/**
 * Proxies a remote media file through the Astro server so the browser
 * receives it as a forced download (Content-Disposition: attachment)
 * instead of playing it inline.
 *
 * Usage: GET /api/proxy-download?url=<encoded-direct-url>&filename=<name>
 */
export const GET: APIRoute = async ({ url }) => {
  const fileUrl  = url.searchParams.get('url');
  const filename = url.searchParams.get('filename') ?? 'download.mkv';

  if (!fileUrl) {
    return new Response('Missing url parameter', { status: 400 });
  }

  // Only allow known stream domains — prevents open-redirect abuse
  const ALLOWED_HOSTS = [
    'streamflixapi.site',
    'jpaworx.com',
    'servers.jpaworx.com',
  ];

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(fileUrl);
  } catch {
    return new Response('Invalid url parameter', { status: 400 });
  }

  const hostAllowed = ALLOWED_HOSTS.some(h => parsedUrl.hostname.endsWith(h));
  if (!hostAllowed) {
    return new Response('URL not allowed', { status: 403 });
  }

  try {
    const upstream = await fetch(fileUrl, {
      headers: {
        // Pass the required headers the stream server expects
        'Referer': `https://${parsedUrl.hostname}/`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36',
      },
    });

    if (!upstream.ok) {
      return new Response(`Upstream error: ${upstream.status}`, { status: 502 });
    }

    const contentType = upstream.headers.get('content-type') ?? 'video/x-matroska';
    const contentLength = upstream.headers.get('content-length');

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    };

    if (contentLength) {
      headers['Content-Length'] = contentLength;
    }

    // Stream the body directly — no buffering in memory
    return new Response(upstream.body, { status: 200, headers });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(`Proxy error: ${message}`, { status: 503 });
  }
};

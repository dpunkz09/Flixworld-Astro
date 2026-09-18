export const prerender = false;

import type { APIRoute } from 'astro';

const EMBED_ORIGIN = 'https://vidrock.to';

export const GET: APIRoute = async ({ url }) => {
  const type    = url.searchParams.get('type');   // 'movie' | 'tv'
  const id      = url.searchParams.get('id');
  const season  = url.searchParams.get('season');
  const episode = url.searchParams.get('episode');

  if (!id || isNaN(Number(id))) {
    return new Response('Missing or invalid id', { status: 400 });
  }

  let upstreamUrl: string;

  if (type === 'tv') {
    if (!season || !episode) {
      return new Response('TV type requires season and episode', { status: 400 });
    }
    upstreamUrl = `${EMBED_ORIGIN}/tv/${id}/${season}/${episode}`;
  } else {
    // default: movie
    upstreamUrl = `${EMBED_ORIGIN}/movie/${id}`;
  }

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      headers: {
        'Referer': `${EMBED_ORIGIN}/`,
        'Origin':  EMBED_ORIGIN,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[embed] Fetch failed: ${msg}`);
    return new Response(`Failed to reach embed server: ${msg}`, { status: 502 });
  }

  if (!upstream.ok) {
    console.error(`[embed] Upstream returned ${upstream.status} for ${upstreamUrl}`);
    return new Response(`Upstream error ${upstream.status}`, { status: upstream.status });
  }

  const contentType = upstream.headers.get('content-type') ?? 'text/html';
  const body        = await upstream.arrayBuffer();

  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type':                contentType,
      'Cache-Control':               'no-store',
      // Allow the iframe to embed our proxy response
      'X-Frame-Options':             'SAMEORIGIN',
      'Content-Security-Policy':     "frame-ancestors 'self'",
    },
  });
};

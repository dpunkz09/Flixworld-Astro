export const prerender = false;

import type { APIRoute } from 'astro';

// Use env var so production can override without code changes.
// Falls back to 127.0.0.1 (explicit IPv4) — avoids Linux resolving
// "localhost" to ::1 (IPv6) when the stream server only binds IPv4.
const STREAM_BASE =
  (import.meta.env.STREAM_SERVER_URL ?? 'http://127.0.0.1:4444') +
  '/stream/vidzee';

export const GET: APIRoute = async ({ url }) => {
  const type    = url.searchParams.get('type');     // 'movie' | 'tv'
  const id      = url.searchParams.get('id');       // tmdb id
  const season  = url.searchParams.get('season');   // tv only
  const episode = url.searchParams.get('episode');  // tv only

  // Basic validation
  if (!type || !id || isNaN(Number(id))) {
    return new Response(JSON.stringify({ error: 'Missing or invalid parameters' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let apiUrl: string;
  if (type === 'movie') {
    apiUrl = `${STREAM_BASE}/movie/${id}`;
  } else if (type === 'tv') {
    if (!season || !episode || isNaN(Number(season)) || isNaN(Number(episode))) {
      return new Response(JSON.stringify({ error: 'TV type requires season and episode' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    apiUrl = `${STREAM_BASE}/tv/${id}/${season}/${episode}`;
  } else {
    return new Response(JSON.stringify({ error: 'type must be movie or tv' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const upstream = await fetch(apiUrl, { signal: AbortSignal.timeout(15_000) });

    if (!upstream.ok) {
      return new Response(JSON.stringify({ error: `Upstream error ${upstream.status}` }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const data = await upstream.json();

    // Pull the direct URL from extracted.url or first stream url
    const directUrl: string | undefined =
      data?.extracted?.url ||
      data?.extracted?.streams?.[0]?.url;

    if (!directUrl) {
      return new Response(JSON.stringify({ error: 'No stream URL found in response' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Return just what the client needs
    return new Response(
      JSON.stringify({
        ok: true,
        url: directUrl,
        language: data?.extracted?.streams?.[0]?.language ?? 'Unknown',
        quality: data?.raw?.streams?.[0]?.quality ?? 'auto',
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          // Don't cache — stream URLs may expire
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return new Response(JSON.stringify({ error: `Failed to reach stream server: ${message}` }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};

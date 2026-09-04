export const prerender = false;

import type { APIRoute } from 'astro';

// process.env is read at RUNTIME (not baked in at build time like import.meta.env).
// This means the production server can set STREAM_SERVER_URL in its environment
// without needing a rebuild.
// Explicit 127.0.0.1 avoids Linux resolving "localhost" to ::1 (IPv6) when the
// stream server only binds on IPv4.
function getStreamBase(): string {
  return (process.env.STREAM_SERVER_URL ?? 'https://servers.jpaworx.com') + '/stream/vidzee';
}

export const GET: APIRoute = async ({ url }) => {
  const type    = url.searchParams.get('type');
  const id      = url.searchParams.get('id');
  const season  = url.searchParams.get('season');
  const episode = url.searchParams.get('episode');

  if (!type || !id || isNaN(Number(id))) {
    return json({ error: 'Missing or invalid parameters' }, 400);
  }

  const STREAM_BASE = getStreamBase();
  let apiUrl: string;

  if (type === 'movie') {
    apiUrl = `${STREAM_BASE}/movie/${id}`;
  } else if (type === 'tv') {
    if (!season || !episode || isNaN(Number(season)) || isNaN(Number(episode))) {
      return json({ error: 'TV type requires season and episode' }, 400);
    }
    apiUrl = `${STREAM_BASE}/tv/${id}/${season}/${episode}`;
  } else {
    return json({ error: 'type must be movie or tv' }, 400);
  }

  console.log(`[download] Fetching: ${apiUrl}`);

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    let upstream: Response;
    try {
      upstream = await fetch(apiUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }

    if (!upstream.ok) {
      const body = await upstream.text().catch(() => '');
      console.error(`[download] Upstream ${upstream.status}: ${body}`);
      return json({ error: `Upstream error ${upstream.status}` }, 502);
    }

    const data = await upstream.json();

    const directUrl: string | undefined =
      data?.extracted?.url ??
      data?.extracted?.streams?.[0]?.url;

    if (!directUrl) {
      console.error('[download] No URL in response:', JSON.stringify(data));
      return json({ error: 'No stream URL found in response' }, 404);
    }

    console.log(`[download] OK → ${directUrl}`);

    return json({
      ok: true,
      url: directUrl,
      language: data?.extracted?.streams?.[0]?.language ?? 'Unknown',
      quality:  data?.raw?.streams?.[0]?.quality ?? 'auto',
    }, 200);

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[download] Fetch failed: ${message}`);
    return json({ error: `Failed to reach stream server: ${message}` }, 503);
  }
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

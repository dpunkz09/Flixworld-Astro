export const prerender = false;

import type { APIRoute } from 'astro';

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

  // Use a TransformStream to keep the connection alive while waiting for the
  // upstream response. Cloudflare closes idle connections after ~100s — by
  // flushing a space character every 5s we prevent that without buffering the
  // actual response. The client ignores leading whitespace in JSON.
  const { readable, writable } = new TransformStream();
  const writer = writable.getWriter();
  const enc    = new TextEncoder();

  // Keep-alive: write a space every 5 seconds so Cloudflare doesn't time out
  const keepAlive = setInterval(() => {
    writer.write(enc.encode(' ')).catch(() => clearInterval(keepAlive));
  }, 5_000);

  // Fetch upstream in the background, write result, close stream
  (async () => {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 30_000);

      let upstream: Response;
      try {
        upstream = await fetch(apiUrl, { signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }

      if (!upstream.ok) {
        const body = await upstream.text().catch(() => '');
        console.error(`[download] Upstream ${upstream.status}: ${body}`);
        await writer.write(enc.encode(JSON.stringify({ error: `Upstream error ${upstream.status}` })));
        return;
      }

      const data = await upstream.json();
      const directUrl: string | undefined =
        data?.extracted?.url ??
        data?.extracted?.streams?.[0]?.url;

      if (!directUrl) {
        console.error('[download] No URL in response:', JSON.stringify(data));
        await writer.write(enc.encode(JSON.stringify({ error: 'No stream URL found in response' })));
        return;
      }

      console.log(`[download] OK → ${directUrl}`);

      await writer.write(enc.encode(JSON.stringify({
        ok:       true,
        url:      directUrl,
        language: data?.extracted?.streams?.[0]?.language ?? 'Unknown',
        quality:  data?.raw?.streams?.[0]?.quality ?? 'auto',
      })));

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[download] Fetch failed: ${message}`);
      await writer.write(enc.encode(JSON.stringify({ error: `Failed to reach stream server: ${message}` }))).catch(() => {});
    } finally {
      clearInterval(keepAlive);
      writer.close().catch(() => {});
    }
  })();

  return new Response(readable, {
    status: 200,
    headers: {
      'Content-Type':  'application/json',
      'Cache-Control': 'no-store',
      // Tell Cloudflare not to buffer — stream bytes to client as they arrive
      'X-Accel-Buffering': 'no',
    },
  });
};

function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type':  'application/json',
      'Cache-Control': 'no-store',
    },
  });
}

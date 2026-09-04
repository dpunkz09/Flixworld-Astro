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

  const enc = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Write the opening bracket IMMEDIATELY — this is the first byte
      // Cloudflare sees, so it won't time out waiting for origin to respond.
      // The client will receive a JSON array: [<payload>]
      controller.enqueue(enc.encode('['));

      // Keep-alive: enqueue a space every 5s while upstream is working
      const keepAlive = setInterval(() => {
        try { controller.enqueue(enc.encode(' ')); } catch {}
      }, 5_000);

      try {
        const controller2 = new AbortController();
        const timer = setTimeout(() => controller2.abort(), 30_000);

        let upstream: Response;
        try {
          upstream = await fetch(apiUrl, { signal: controller2.signal });
        } finally {
          clearTimeout(timer);
        }

        let payload: object;

        if (!upstream.ok) {
          const body = await upstream.text().catch(() => '');
          console.error(`[download] Upstream ${upstream.status}: ${body}`);
          payload = { error: `Upstream error ${upstream.status}` };
        } else {
          const data = await upstream.json();
          const directUrl: string | undefined =
            data?.extracted?.url ??
            data?.extracted?.streams?.[0]?.url;

          if (!directUrl) {
            console.error('[download] No URL in response:', JSON.stringify(data));
            payload = { error: 'No stream URL found in response' };
          } else {
            console.log(`[download] OK → ${directUrl}`);
            payload = {
              ok:       true,
              url:      directUrl,
              language: data?.extracted?.streams?.[0]?.language ?? 'Unknown',
              quality:  data?.raw?.streams?.[0]?.quality ?? 'auto',
            };
          }
        }

        controller.enqueue(enc.encode(JSON.stringify(payload)));

      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[download] Fetch failed: ${message}`);
        controller.enqueue(enc.encode(JSON.stringify({ error: `Failed to reach stream server: ${message}` })));
      } finally {
        clearInterval(keepAlive);
        // Close the JSON array and stream
        controller.enqueue(enc.encode(']'));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type':      'application/json',
      'Cache-Control':     'no-store',
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

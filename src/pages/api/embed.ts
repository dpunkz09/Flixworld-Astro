export const prerender = false;

import type { APIRoute } from 'astro';

const UPSTREAM = 'https://vidrock.to';

// Script filenames to strip entirely from the HTML response.
const BLOCKED_SCRIPTS = ['aclib.js', 'sbx.js'];

/**
 * Strips <script> tags whose src contains any blocked filename.
 * Handles both self-closing and paired <script ...></script> forms.
 */
function stripScripts(html: string): string {
  for (const name of BLOCKED_SCRIPTS) {
    // Paired: <script ... src="...aclib.js...">...</script>
    // The [^>]* is non-greedy-friendly; we use [\s\S]*? for body.
    const paired = new RegExp(
      `<script[^>]+src=[^>]*${escapeRegex(name)}[^>]*>[\\s\\S]*?<\\/script>`,
      'gi'
    );
    html = html.replace(paired, '<!-- blocked: ' + name + ' -->');

    // Self-closing / no-body: <script ... src="...aclib.js..." />
    const selfClose = new RegExp(
      `<script[^>]+src=[^>]*${escapeRegex(name)}[^>]*/?>`,
      'gi'
    );
    html = html.replace(selfClose, '<!-- blocked: ' + name + ' -->');
  }
  return html;
}

/** Escapes special regex characters in a literal string. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Rewrites relative URLs in src/href/action attributes to absolute
 * ones pointing at the upstream origin, so sub-resources still load
 * when the page is served from our domain.
 *
 * Only touches values that start with / (root-relative) or are
 * plain paths — leaves http(s):// and // protocol-relative URLs alone.
 */
function rewriteUrls(html: string, base: string): string {
  // src="..." href="..." action="..."
  return html.replace(
    /((?:src|href|action)=["'])(?!https?:\/\/|\/\/|data:|blob:|#|javascript:)(\/?)([^"']*)(["'])/gi,
    (_, attr, slash, path, quote) => {
      const abs = slash === '/'
        ? `${base}/${path}`      // root-relative: /foo → https://vidrock.to/foo
        : `${base}/${path}`;     // relative: foo → https://vidrock.to/foo
      return `${attr}${abs}${quote}`;
    }
  );
}

export const GET: APIRoute = async ({ url }) => {
  const type    = url.searchParams.get('type');
  const id      = url.searchParams.get('id');
  const season  = url.searchParams.get('season');
  const episode = url.searchParams.get('episode');

  if (!id || isNaN(Number(id))) {
    return new Response('Missing or invalid id', { status: 400 });
  }

  let upstreamPath: string;
  if (type === 'tv') {
    if (!season || !episode) {
      return new Response('TV requires season and episode', { status: 400 });
    }
    upstreamPath = `/tv/${id}/${season}/${episode}`;
  } else {
    upstreamPath = `/movie/${id}`;
  }

  const upstreamUrl = `${UPSTREAM}${upstreamPath}`;

  // Abort if upstream takes longer than 15 s
  const ac    = new AbortController();
  const timer = setTimeout(() => ac.abort(), 15_000);

  let upstream: Response;
  try {
    upstream = await fetch(upstreamUrl, {
      signal: ac.signal,
      headers: {
        'Referer':         `${UPSTREAM}/`,
        'Origin':          UPSTREAM,
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
          '(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept':
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[embed] fetch error: ${msg}`);
    return new Response(`Upstream unreachable: ${msg}`, { status: 502 });
  } finally {
    clearTimeout(timer);
  }

  if (!upstream.ok) {
    console.error(`[embed] upstream ${upstream.status} for ${upstreamUrl}`);
    return new Response(`Upstream error ${upstream.status}`, { status: upstream.status });
  }

  const contentType = upstream.headers.get('content-type') ?? 'text/html; charset=utf-8';
  const isHtml      = contentType.includes('text/html');

  if (!isHtml) {
    // For non-HTML sub-resources (JS bundles, etc.) just pass through.
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type':  contentType,
        'Cache-Control': 'public, max-age=300',
      },
    });
  }

  let html = await upstream.text();

  // 1. Strip blocked ad/tracker scripts
  html = stripScripts(html);

  // 2. Rewrite root-relative URLs so assets load via upstream origin
  html = rewriteUrls(html, UPSTREAM);

  // 3. Inject a base tag as the very first thing inside <head> as a
  //    belt-and-suspenders fallback for any URLs we missed above.
  html = html.replace(
    /(<head[^>]*>)/i,
    `$1<base href="${UPSTREAM}/">`
  );

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type':  'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
      // Allow our own iframe to embed this page
      'X-Frame-Options': 'SAMEORIGIN',
    },
  });
};

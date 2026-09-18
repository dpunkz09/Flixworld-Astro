export const prerender = false;

import type { APIRoute } from 'astro';

const UPSTREAM = 'https://vidrock.to';

// Script filenames to strip entirely from the proxied HTML.
const BLOCKED_SCRIPTS = ['aclib.js', 'sbx.js'];

/** Escapes special regex characters in a literal string. */
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Strips <script> tags whose src contains any blocked filename.
 * Handles both self-closing and paired <script …></script> forms.
 */
function stripBlockedScripts(html: string): string {
  for (const name of BLOCKED_SCRIPTS) {
    const pat = escapeRegex(name);
    // Paired: <script ... src="...name...">...</script>
    html = html.replace(
      new RegExp(`<script[^>]+src=[^>]*${pat}[^>]*>[\\s\\S]*?<\\/script>`, 'gi'),
      `<!-- blocked:${name} -->`
    );
    // Self-closing / bodyless: <script ... src="...name..." />  or  <script ... src="...name...">
    html = html.replace(
      new RegExp(`<script[^>]+src=[^>]*${pat}[^>]*/?>`, 'gi'),
      `<!-- blocked:${name} -->`
    );
  }
  return html;
}

/**
 * Rewrites root-relative URLs in src/href/action attributes to absolute
 * upstream URLs so sub-resources load correctly when served from our domain.
 * Leaves http(s)://, //, data:, blob:, # and javascript: values untouched.
 */
function rewriteUrls(html: string): string {
  return html.replace(
    /((?:src|href|action)=["'])(?!https?:\/\/|\/\/|data:|blob:|#|javascript:)(\/[^"']*)(["'])/gi,
    `$1${UPSTREAM}$2$3`
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
  const ac          = new AbortController();
  const timer       = setTimeout(() => ac.abort(), 20_000);

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
    console.error(`[embed] fetch failed for ${upstreamUrl}: ${msg}`);
    // Return a minimal player page that shows an error rather than crashing the server
    return new Response(errorPage(msg), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  } finally {
    clearTimeout(timer);
  }

  if (!upstream.ok) {
    console.error(`[embed] upstream ${upstream.status} for ${upstreamUrl}`);
    return new Response(errorPage(`Upstream returned ${upstream.status}`), {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
    });
  }

  const contentType = upstream.headers.get('content-type') ?? 'text/html; charset=utf-8';

  // For non-HTML assets (JS bundles, CSS, images) pass through as-is
  if (!contentType.includes('text/html')) {
    return new Response(upstream.body, {
      status: 200,
      headers: {
        'Content-Type':  contentType,
        'Cache-Control': 'public, max-age=300',
      },
    });
  }

  // HTML path: read, rewrite, strip blocked scripts
  let html = await upstream.text();
  html = stripBlockedScripts(html);
  html = rewriteUrls(html);

  // Belt-and-suspenders: inject <base> so any URLs we missed still resolve
  html = html.replace(/(<head[^>]*>)/i, `$1<base href="${UPSTREAM}/">`);

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type':    'text/html; charset=utf-8',
      'Cache-Control':   'no-store',
      'X-Frame-Options': 'SAMEORIGIN',
    },
  });
};

function errorPage(msg: string): string {
  return `<!doctype html><html><head><meta charset="UTF-8">
<style>*{margin:0;padding:0}body{background:#000;color:#888;font-family:system-ui;
display:flex;align-items:center;justify-content:center;min-height:100vh;font-size:13px;}</style>
</head><body><p>Player unavailable — ${msg.replace(/</g,'&lt;')}</p></body></html>`;
}

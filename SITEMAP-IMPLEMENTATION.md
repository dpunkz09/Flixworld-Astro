# Dynamic Sitemap with Movie/TV URLs — Implementation Summary

## Overview

The sitemap now includes 300+ individual movie and TV show pages (in addition to static pages like `/`, `/movies`, `/tv`, `/search`), all using SEO-friendly slug-based URLs.

## What Was Added

### 1. URL Generation Script
**File:** `scripts/generate-sitemap-urls.js`

- Fetches popular, trending, and top-rated content from TMDB at build time
- Generates slug-based URLs for ~150 movies and ~160 TV shows
- Outputs pure JSON to stdout (logs go to stderr for clean parsing)
- Deduplicates by ID to avoid duplicate sitemap entries

**Content sources:**
- Popular movies (5 pages = ~100 movies)
- Popular TV (5 pages = ~100 shows)
- Trending movies/TV (weekly)
- Top-rated movies/TV (3 pages each)

Total: **~308 URLs** included in sitemap

### 2. Build-Time Integration
**File:** `astro.config.mjs`

- Runs the script during build via `execSync()`
- Parses JSON output and passes URLs to sitemap integration
- Falls back gracefully if script fails (logs warning, continues with static pages only)

### 3. Sitemap Configuration

**Priority levels:**
- Homepage: `1.0` (highest)
- Category pages (`/movies`, `/tv`): `0.9`
- Individual movie/TV pages: `0.8`
- Search page: `0.6`

**Change frequency:**
- Homepage & categories: `daily`
- Movie/TV pages: `weekly`
- Search: `monthly`

**Excluded from sitemap:**
- `/watch/*` pages (no SEO value — just video player)
- `/embed/*` routes (internal API endpoints)

## Build Output

```
Fetching content from TMDB...
Found 147 unique movies
Found 161 unique TV shows
✓ Generated 308 dynamic URLs for sitemap
```

## Sample URLs in Sitemap

Movies:
```
https://flixworld.xyz/movie/spider-man-brand-new-day-2026-969681
https://flixworld.xyz/movie/the-shawshank-redemption-1994-278
https://flixworld.xyz/movie/the-dark-knight-2008-155
https://flixworld.xyz/movie/inception-2010-27205
```

TV Shows:
```
https://flixworld.xyz/tv/breaking-bad-2008-1396
https://flixworld.xyz/tv/arcane-2021-94605
https://flixworld.xyz/tv/stranger-things-2016-66732
https://flixworld.xyz/tv/the-office-2005-2316
```

## SEO Benefits

1. **Search engines discover content faster** — 300+ pages indexed immediately vs. waiting for crawl discovery
2. **Better rankings** — content explicitly listed in sitemap gets priority in crawl budget
3. **Proper URL structure** — slug-based URLs with keywords improve relevance signals
4. **Fresh content** — weekly changefreq tells search engines to check back regularly
5. **Priority hints** — search engines understand which pages matter most

## How It Works

1. **Build starts** → Astro config runs `generate-sitemap-urls.js`
2. **Script fetches** → Queries TMDB API for popular/trending/top-rated content
3. **URLs generated** → Converts titles to slugs, outputs JSON array
4. **Sitemap created** → Astro sitemap integration includes both static pages + dynamic URLs
5. **Deployed** → Sitemap available at `https://flixworld.xyz/sitemap-index.xml`

## Files Modified

- `scripts/generate-sitemap-urls.js` (new)
- `astro.config.mjs` (updated to run script and configure sitemap)

## Testing

View sitemap after build:
```bash
npm run build
# Check dist/client/sitemap-index.xml
# Check dist/client/sitemap-0.xml for actual URLs
```

Or in production:
- https://flixworld.xyz/sitemap-index.xml
- https://flixworld.xyz/sitemap-0.xml

## Notes

- Script requires `TMDB_API_KEY` in `.env` file
- Runs at build time only (not on every request)
- Content is refreshed on each deploy
- Can adjust number of pages fetched in script (currently 5 pages per category)
- All URLs use canonical slug format for consistency

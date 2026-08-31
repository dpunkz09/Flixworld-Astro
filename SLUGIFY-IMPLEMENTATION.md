# SEO-Friendly Slug URLs — Implementation Summary

## What Changed

All movie, TV show, and watch page URLs now use SEO-friendly slugs instead of bare numeric IDs:

### Before
```
/movie/108978
/tv/136315
/watch/movie/108978
/watch/tv/108978/1/1
```

### After
```
/movie/reacher-2022-108978
/tv/the-bear-2022-136315
/watch/movie/reacher-2022-108978
/watch/tv/the-bear-2022-136315/1/1
```

## Technical Details

### Slug Format

`{title-slugified}-{year}-{id}`

- Title is lowercased, accented chars transliterated, non-alphanumeric stripped, spaces → hyphens
- Year is 4-digit year from release/first_air date
- ID is the TMDB numeric ID (for parsing and API calls)

### Files Modified

**Core library:**
- `src/lib/slugify.ts` — new utility module with `toSlug()`, `parseSlugId()`, path builders

**Page routes (renamed `[id].astro` → `[slug].astro`):**
- `src/pages/movie/[slug].astro`
- `src/pages/tv/[slug].astro`
- `src/pages/watch/movie/[slug].astro`
- `src/pages/watch/tv/[slug]/[season]/[episode].astro`

All four pages:
1. Extract numeric ID from slug via `parseSlugId(slug)`
2. Fetch data from TMDB using the numeric ID
3. Compare current slug to canonical slug
4. If mismatch → 301 redirect to canonical URL
5. All internal links use slug-based path helpers

**Components:**
- `src/components/MovieCard.astro` — uses `moviePath()` / `tvPath()`
- `src/components/HeroSection.astro` — uses `moviePath()` / `tvPath()`

### Backward Compatibility

Old numeric URLs like `/movie/108978` still work:
1. Route matches `/movie/[slug]`
2. `parseSlugId("108978")` extracts `108978`
3. Page fetches data, builds canonical slug `"reacher-2022-108978"`
4. Slug mismatch detected → **301 redirect** to `/movie/reacher-2022-108978`

Search engines and bookmarks are automatically redirected to the new canonical URLs.

### Benefits

1. **SEO**: Keywords in URL improve discoverability
2. **Readability**: Users can see what content the link points to
3. **Social sharing**: Prettier URLs in social media previews
4. **Analytics**: Easier to identify content in logs and reports
5. **Backward compat**: Old links redirect permanently (301)

## Testing

Build completes without errors. Verify in dev mode:

```bash
npm run dev
```

Visit:
- `http://localhost:4321/movie/108978` → redirects to slugified URL
- `http://localhost:4321/tv/136315` → redirects to slugified URL
- Homepage cards link to slugified URLs
- Detail page "Watch Now" buttons link to slugified watch pages
- Recommendations link to slugified URLs

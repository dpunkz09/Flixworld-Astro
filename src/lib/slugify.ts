/**
 * URL slug utilities
 *
 * Format: "{title-slugified}-{year}-{id}"
 * Examples:
 *   "Reacher" (2022, id 108978)  → "reacher-2022-108978"
 *   "The Bear" (2022, id 136315) → "the-bear-2022-136315"
 *
 * Parsing is ID-based: we extract the numeric suffix after the last "-".
 * This means old numeric-only URLs like "/movie/108978" continue to work
 * after a redirect (the `parseSlugId` function handles bare numbers too).
 */

/**
 * Convert a title + year + id into a URL-safe slug.
 * Non-ASCII chars are transliterated then stripped; spaces become hyphens.
 */
export function toSlug(title: string, year: string | number, id: number): string {
  const titlePart = title
    .toLowerCase()
    // Replace common accented characters
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Replace non-alphanumeric (except spaces/hyphens) with empty string
    .replace(/[^a-z0-9 -]/g, '')
    // Collapse whitespace to single hyphen
    .replace(/\s+/g, '-')
    // Collapse consecutive hyphens
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return `${titlePart}-${year}-${id}`;
}

/**
 * Extract the TMDB numeric ID from a slug.
 * Works for both full slugs ("reacher-2022-108978") and bare IDs ("108978").
 * Returns NaN if the slug doesn't end with a number.
 */
export function parseSlugId(slug: string): number {
  const parts = slug.split('-');
  return parseInt(parts[parts.length - 1], 10);
}

/** Build the canonical URL path for a movie. */
export function moviePath(title: string, year: string | number, id: number): string {
  return `/movie/${toSlug(title, year, id)}`;
}

/** Build the canonical URL path for a TV show. */
export function tvPath(name: string, year: string | number, id: number): string {
  return `/tv/${toSlug(name, year, id)}`;
}

/** Build the canonical watch path for a movie. */
export function watchMoviePath(title: string, year: string | number, id: number): string {
  return `/watch/movie/${toSlug(title, year, id)}`;
}

/** Build the canonical watch path for a TV episode. */
export function watchTVPath(
  name: string,
  year: string | number,
  id: number,
  season: number,
  episode: number,
): string {
  return `/watch/tv/${toSlug(name, year, id)}/${season}/${episode}`;
}

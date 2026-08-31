/**
 * TMDB API utility module
 * Docs: https://developer.themoviedb.org/docs
 */

const API_KEY = import.meta.env.TMDB_API_KEY;
const BASE_URL = 'https://api.themoviedb.org/3';

export const IMG_BASE = {
  original: 'https://image.tmdb.org/t/p/original',
  w1280: 'https://image.tmdb.org/t/p/w1280',
  w500: 'https://image.tmdb.org/t/p/w500',
  w780: 'https://image.tmdb.org/t/p/w780',
  w300: 'https://image.tmdb.org/t/p/w300',
  w185: 'https://image.tmdb.org/t/p/w185',
  w92: 'https://image.tmdb.org/t/p/w92',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Movie {
  id: number;
  title: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  genres?: Genre[];
  adult: boolean;
  original_language: string;
  popularity: number;
  runtime?: number;
  status?: string;
  tagline?: string;
  budget?: number;
  revenue?: number;
  production_companies?: ProductionCompany[];
}

export interface TVShow {
  id: number;
  name: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  first_air_date: string;
  vote_average: number;
  vote_count: number;
  genre_ids: number[];
  genres?: Genre[];
  original_language: string;
  popularity: number;
  number_of_seasons?: number;
  number_of_episodes?: number;
  status?: string;
  tagline?: string;
  networks?: Network[];
  episode_run_time?: number[];
}

export interface Genre {
  id: number;
  name: string;
}

export interface CastMember {
  id: number;
  name: string;
  character: string;
  profile_path: string | null;
  order: number;
}

export interface CrewMember {
  id: number;
  name: string;
  job: string;
  department: string;
  profile_path: string | null;
}

export interface Video {
  id: string;
  key: string;
  name: string;
  site: string;
  type: string;
  official: boolean;
  published_at: string;
}

export interface ProductionCompany {
  id: number;
  name: string;
  logo_path: string | null;
}

export interface Network {
  id: number;
  name: string;
  logo_path: string | null;
}

export interface SearchResult {
  id: number;
  media_type: 'movie' | 'tv' | 'person';
  title?: string;
  name?: string;
  overview: string;
  poster_path: string | null;
  backdrop_path: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average: number;
  genre_ids: number[];
}

export interface PaginatedResponse<T> {
  page: number;
  results: T[];
  total_pages: number;
  total_results: number;
}

// ---------------------------------------------------------------------------
// TTL in-memory cache
// Avoids hammering TMDB on every request for identical endpoints.
// Keyed by full URL string; entries expire after CACHE_TTL_MS.
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const _cache = new Map<string, CacheEntry<unknown>>();

function cacheGet<T>(key: string): T | null {
  const entry = _cache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) { _cache.delete(key); return null; }
  return entry.data as T;
}

function cacheSet<T>(key: string, data: T): void {
  _cache.set(key, { data, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ---------------------------------------------------------------------------
// Core fetch helper — with cache + exponential-backoff retry on 429/503
// ---------------------------------------------------------------------------

async function tmdbFetch<T>(
  endpoint: string,
  params: Record<string, string | number> = {},
  retries = 3
): Promise<T> {
  if (!API_KEY) {
    throw new Error(
      'TMDB_API_KEY is not set. Add it to your .env file. Get one free at https://www.themoviedb.org/settings/api'
    );
  }

  const url = new URL(`${BASE_URL}${endpoint}`);
  url.searchParams.set('api_key', API_KEY);
  url.searchParams.set('language', 'en-US');

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, String(value));
  }

  const cacheKey = url.toString();
  const cached = cacheGet<T>(cacheKey);
  if (cached) return cached;

  for (let attempt = 0; attempt < retries; attempt++) {
    const res = await fetch(cacheKey);

    // Retry on rate-limit or server errors with exponential backoff
    if ((res.status === 429 || res.status === 503) && attempt < retries - 1) {
      const delay = 500 * 2 ** attempt; // 500ms, 1s, 2s
      await new Promise(r => setTimeout(r, delay));
      continue;
    }

    if (!res.ok) {
      throw new Error(`TMDB API error ${res.status}: ${res.statusText} — ${endpoint}`);
    }

    const data = await res.json() as T;
    cacheSet(cacheKey, data);
    return data;
  }

  throw new Error(`TMDB API failed after ${retries} retries — ${endpoint}`);
}

// ---------------------------------------------------------------------------
// Movies
// ---------------------------------------------------------------------------

export async function getTrendingMovies(timeWindow: 'day' | 'week' = 'week') {
  return tmdbFetch<PaginatedResponse<Movie>>(`/trending/movie/${timeWindow}`);
}

export async function getPopularMovies(page = 1) {
  return tmdbFetch<PaginatedResponse<Movie>>('/movie/popular', { page });
}

export async function getTopRatedMovies(page = 1) {
  return tmdbFetch<PaginatedResponse<Movie>>('/movie/top_rated', { page });
}

export async function getNowPlayingMovies(page = 1) {
  return tmdbFetch<PaginatedResponse<Movie>>('/movie/now_playing', { page });
}

export async function getUpcomingMovies(page = 1) {
  return tmdbFetch<PaginatedResponse<Movie>>('/movie/upcoming', { page });
}

export async function getMoviesByGenre(genreId: number, page = 1) {
  return tmdbFetch<PaginatedResponse<Movie>>('/discover/movie', {
    with_genres: genreId,
    sort_by: 'popularity.desc',
    page,
  });
}

export async function getMovieDetails(id: number) {
  return tmdbFetch<Movie>(`/movie/${id}`);
}

export async function getMovieCredits(id: number) {
  return tmdbFetch<{ cast: CastMember[]; crew: CrewMember[] }>(`/movie/${id}/credits`);
}

export async function getMovieVideos(id: number) {
  return tmdbFetch<{ results: Video[] }>(`/movie/${id}/videos`);
}

export async function getSimilarMovies(id: number, page = 1) {
  return tmdbFetch<PaginatedResponse<Movie>>(`/movie/${id}/similar`, { page });
}

export async function getMovieRecommendations(id: number, page = 1) {
  return tmdbFetch<PaginatedResponse<Movie>>(`/movie/${id}/recommendations`, { page });
}

export async function getMovieGenres() {
  return tmdbFetch<{ genres: Genre[] }>('/genre/movie/list');
}

// ---------------------------------------------------------------------------
// TV Shows
// ---------------------------------------------------------------------------

export async function getTrendingTV(timeWindow: 'day' | 'week' = 'week') {
  return tmdbFetch<PaginatedResponse<TVShow>>(`/trending/tv/${timeWindow}`);
}

export async function getPopularTV(page = 1) {
  return tmdbFetch<PaginatedResponse<TVShow>>('/tv/popular', { page });
}

export async function getTopRatedTV(page = 1) {
  return tmdbFetch<PaginatedResponse<TVShow>>('/tv/top_rated', { page });
}

export async function getAiringTodayTV(page = 1) {
  return tmdbFetch<PaginatedResponse<TVShow>>('/tv/airing_today', { page });
}

export async function getOnTheAirTV(page = 1) {
  return tmdbFetch<PaginatedResponse<TVShow>>('/tv/on_the_air', { page });
}

export async function getTVByGenre(genreId: number, page = 1) {
  return tmdbFetch<PaginatedResponse<TVShow>>('/discover/tv', {
    with_genres: genreId,
    sort_by: 'popularity.desc',
    page,
  });
}

export async function getTVDetails(id: number) {
  return tmdbFetch<TVShow>(`/tv/${id}`);
}

export async function getTVCredits(id: number) {
  return tmdbFetch<{ cast: CastMember[]; crew: CrewMember[] }>(`/tv/${id}/credits`);
}

export async function getTVVideos(id: number) {
  return tmdbFetch<{ results: Video[] }>(`/tv/${id}/videos`);
}

export async function getSimilarTV(id: number, page = 1) {
  return tmdbFetch<PaginatedResponse<TVShow>>(`/tv/${id}/similar`, { page });
}

export async function getTVRecommendations(id: number, page = 1) {
  return tmdbFetch<PaginatedResponse<TVShow>>(`/tv/${id}/recommendations`, { page });
}

export async function getTVGenres() {
  return tmdbFetch<{ genres: Genre[] }>('/genre/tv/list');
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export async function searchMulti(query: string, page = 1) {
  return tmdbFetch<PaginatedResponse<SearchResult>>('/search/multi', { query, page });
}

export async function searchMovies(query: string, page = 1) {
  return tmdbFetch<PaginatedResponse<Movie>>('/search/movie', { query, page });
}

export async function searchTV(query: string, page = 1) {
  return tmdbFetch<PaginatedResponse<TVShow>>('/search/tv', { query, page });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns the best trailer YouTube key from a videos list, or null */
export function getTrailerKey(videos: Video[]): string | null {
  const trailers = videos.filter(
    (v) => v.site === 'YouTube' && v.type === 'Trailer' && v.official
  );
  if (trailers.length > 0) return trailers[0].key;

  const anyTrailer = videos.find((v) => v.site === 'YouTube' && v.type === 'Trailer');
  return anyTrailer?.key ?? null;
}

/** Format a vote average to one decimal place */
export function formatRating(rating: number): string {
  return rating.toFixed(1);
}

/** Format a runtime in minutes to "Xh Ym" */
export function formatRuntime(minutes: number): string {
  if (!minutes) return 'N/A';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/** Format a release/air date to a readable year or full date */
export function formatYear(dateStr: string): string {
  if (!dateStr) return 'N/A';
  return dateStr.substring(0, 4);
}

export function formatDate(dateStr: string): string {
  if (!dateStr) return 'N/A';
  return new Date(dateStr).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/** Get an image URL with fallback */
export function imgUrl(path: string | null | undefined, size: keyof typeof IMG_BASE = 'w500'): string {
  if (!path) return '/placeholder-poster.svg';
  return `${IMG_BASE[size]}${path}`;
}

/** Get backdrop URL — uses original (1920px) by default */
export function backdropUrl(path: string | null | undefined): string {
  if (!path) return '/placeholder-backdrop.svg';
  return `${IMG_BASE.original}${path}`;
}

/** Get backdrop URL at w1280 — suitable for hero/detail sections */
export function backdropUrlW1280(path: string | null | undefined): string {
  if (!path) return '/placeholder-backdrop.svg';
  return `${IMG_BASE.w1280}${path}`;
}

/** Build a color class from vote average */
export function ratingColor(rating: number): string {
  if (rating >= 7.5) return 'rating--high';
  if (rating >= 6) return 'rating--mid';
  return 'rating--low';
}

export interface Episode {
  id: number;
  episode_number: number;
  name: string;
  overview: string;
  still_path: string | null;
  air_date: string;
  vote_average: number;
  runtime: number | null;
}

export interface SeasonDetails {
  id: number;
  season_number: number;
  name: string;
  overview: string;
  episodes: Episode[];
}

export async function getSeasonEpisodes(showId: number, seasonNumber: number) {
  return tmdbFetch<SeasonDetails>(`/tv/${showId}/season/${seasonNumber}`);
}

/**
 * Generate dynamic sitemap URLs for movies and TV shows
 * 
 * This script fetches popular/trending content from TMDB and generates
 * slug-based URLs that will be included in the sitemap.
 * 
 * Run at build time to populate the sitemap with indexable content.
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read .env file manually (since this is a build script, not Astro runtime)
try {
  const envPath = join(__dirname, '..', '.env');
  const envFile = readFileSync(envPath, 'utf-8');
  envFile.split('\n').forEach(line => {
    line = line.trim();
    if (!line || line.startsWith('#')) return;
    const eqIndex = line.indexOf('=');
    if (eqIndex === -1) return;
    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();
    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  });
} catch (err) {
  // .env not found or not readable — rely on existing env vars
  console.warn('Warning: Could not read .env file:', err.message);
}

const API_KEY = process.env.TMDB_API_KEY;
const API_BASE = 'https://api.themoviedb.org/3';

if (!API_KEY) {
  console.error('Error: TMDB_API_KEY environment variable not set');
  process.exit(1);
}

/**
 * Convert a title + year + id into a URL-safe slug (must match slugify.ts logic)
 */
function toSlug(title, year, id) {
  const titlePart = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 -]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return `${titlePart}-${year}-${id}`;
}

function formatYear(dateStr) {
  if (!dateStr) return new Date().getFullYear();
  return dateStr.split('-')[0];
}

async function fetchJSON(endpoint) {
  const url = `${API_BASE}${endpoint}${endpoint.includes('?') ? '&' : '?'}api_key=${API_KEY}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

async function getPopularMovies(pages = 5) {
  const allMovies = [];
  for (let page = 1; page <= pages; page++) {
    const data = await fetchJSON(`/movie/popular?page=${page}`);
    allMovies.push(...data.results);
  }
  return allMovies;
}

async function getPopularTV(pages = 5) {
  const allShows = [];
  for (let page = 1; page <= pages; page++) {
    const data = await fetchJSON(`/tv/popular?page=${page}`);
    allShows.push(...data.results);
  }
  return allShows;
}

async function getTrendingMovies() {
  const data = await fetchJSON('/trending/movie/week');
  return data.results;
}

async function getTrendingTV() {
  const data = await fetchJSON('/trending/tv/week');
  return data.results;
}

async function getTopRatedMovies(pages = 3) {
  const allMovies = [];
  for (let page = 1; page <= pages; page++) {
    const data = await fetchJSON(`/movie/top_rated?page=${page}`);
    allMovies.push(...data.results);
  }
  return allMovies;
}

async function getTopRatedTV(pages = 3) {
  const allShows = [];
  for (let page = 1; page <= pages; page++) {
    const data = await fetchJSON(`/tv/top_rated?page=${page}`);
    allShows.push(...data.results);
  }
  return allShows;
}

async function main() {
  // Log to stderr so stdout remains pure JSON
  console.error('Fetching content from TMDB...');

  const [
    popularMovies,
    popularTV,
    trendingMovies,
    trendingTV,
    topRatedMovies,
    topRatedTV,
  ] = await Promise.all([
    getPopularMovies(5),    // 100 movies
    getPopularTV(5),        // 100 shows
    getTrendingMovies(),    // ~20 movies
    getTrendingTV(),        // ~20 shows
    getTopRatedMovies(3),   // 60 movies
    getTopRatedTV(3),       // 60 shows
  ]);

  // Combine and dedupe by ID
  const movieMap = new Map();
  const tvMap = new Map();

  [...popularMovies, ...trendingMovies, ...topRatedMovies].forEach(movie => {
    if (movie.id && movie.title && movie.release_date) {
      movieMap.set(movie.id, movie);
    }
  });

  [...popularTV, ...trendingTV, ...topRatedTV].forEach(show => {
    if (show.id && show.name && show.first_air_date) {
      tvMap.set(show.id, show);
    }
  });

  console.error(`Found ${movieMap.size} unique movies`);
  console.error(`Found ${tvMap.size} unique TV shows`);

  // Generate URLs
  const urls = [];

  movieMap.forEach(movie => {
    const year = formatYear(movie.release_date);
    const slug = toSlug(movie.title, year, movie.id);
    urls.push(`https://flixworld.xyz/movie/${slug}`);
  });

  tvMap.forEach(show => {
    const year = formatYear(show.first_air_date);
    const slug = toSlug(show.name, year, show.id);
    urls.push(`https://flixworld.xyz/tv/${slug}`);
  });

  // Output as JSON array to stdout (consumed by Astro sitemap integration)
  console.log(JSON.stringify(urls));
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});

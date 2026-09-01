/**
 * Watch-history helpers (localStorage, flixworld.xyz origin)
 *
 * Each entry captures just enough to render a card without any network call:
 * poster path, title, year, href. The list is capped at MAX_ITEMS so it
 * never grows unbounded; the most-recently-watched item is always first.
 *
 * Storage key: "fw:watch-history"
 * Value: JSON array of WatchEntry[]
 */

export type WatchType = 'movie' | 'tv';

export interface WatchEntry {
  /** TMDB id — used as stable dedup key */
  id: number;
  type: WatchType;
  title: string;
  /** 4-digit year string, e.g. "2023" */
  year: string;
  /** e.g. "/abc123.jpg" — relative TMDB path, not full URL */
  posterPath: string | null;
  /** Canonical /watch/… href */
  href: string;
  /** Unix ms timestamp of the last watch — used to sort most-recent first */
  watchedAt: number;
  /** For TV only */
  season?: number;
  episode?: number;
}

const STORAGE_KEY = 'fw:watch-history';
const MAX_ITEMS   = 20;

function readRaw(): WatchEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as WatchEntry[]) : [];
  } catch {
    return [];
  }
}

function writeRaw(entries: WatchEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Quota exceeded or private-browsing restriction — fail silently
  }
}

/**
 * Record (or refresh) a watch entry.
 * If the item already exists it is moved to the front with an updated
 * timestamp; otherwise it is prepended. The list is trimmed to MAX_ITEMS.
 */
export function recordWatch(entry: Omit<WatchEntry, 'watchedAt'>): void {
  const entries = readRaw().filter((e) => e.id !== entry.id || e.type !== entry.type);
  entries.unshift({ ...entry, watchedAt: Date.now() });
  writeRaw(entries.slice(0, MAX_ITEMS));
}

/**
 * Return all watch entries sorted most-recent first.
 * Safe to call on the server (returns []) — only call client-side.
 */
export function loadHistory(): WatchEntry[] {
  return readRaw().sort((a, b) => b.watchedAt - a.watchedAt);
}

/** Remove a single entry by id + type. */
export function removeEntry(id: number, type: WatchType): void {
  writeRaw(readRaw().filter((e) => !(e.id === id && e.type === type)));
}

/** Wipe the entire history. */
export function clearHistory(): void {
  try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
}

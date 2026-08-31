// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import sitemap from '@astrojs/sitemap';
import { execSync } from 'child_process';

// Generate dynamic movie/TV URLs at build time
let dynamicUrls = [];
try {
  console.log('Generating sitemap URLs from TMDB...');
  const output = execSync('node scripts/generate-sitemap-urls.js', {
    encoding: 'utf-8',
    env: { ...process.env },
  });
  dynamicUrls = JSON.parse(output);
  console.log(`✓ Generated ${dynamicUrls.length} dynamic URLs for sitemap`);
} catch (err) {
  console.warn('Warning: Could not generate dynamic sitemap URLs:', err.message);
  console.warn('Sitemap will only include static pages.');
}

export default defineConfig({
  // Astro 7: 'static' is the default. Pages opt in to SSR with `prerender = false`.
  output: 'static',

  adapter: node({ mode: 'standalone' }),
  site: 'https://flixworld.xyz',

  image: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'image.tmdb.org',
      },
    ],
  },

  compressHTML: true,

  build: {
    inlineStylesheets: 'auto',
  },

  vite: {
    build: {
      cssCodeSplit: true,
    },
  },

  integrations: [
    sitemap({
      // Provide custom pages to include in the sitemap
      // This includes both static pages (auto-discovered) and dynamic movie/TV pages
      customPages: dynamicUrls,

      // Exclude watch pages and embed routes from indexing
      filter: (page) => {
        if (page.includes('/watch/')) return false;
        if (page.includes('/embed/')) return false;
        return true;
      },

      // Change frequency hints for crawlers
      changefreq: 'weekly',
      priority: 0.7,

      // Override priority based on URL type
      serialize(item) {
        const url = item.url;

        // Homepage gets highest priority
        if (url === 'https://flixworld.xyz/') {
          return { ...item, priority: 1.0, changefreq: 'daily' };
        }

        // Category pages (movies, tv, search)
        if (url === 'https://flixworld.xyz/movies/' || url === 'https://flixworld.xyz/tv/') {
          return { ...item, priority: 0.9, changefreq: 'daily' };
        }

        if (url === 'https://flixworld.xyz/search/') {
          return { ...item, priority: 0.6, changefreq: 'monthly' };
        }

        // Individual movie/TV pages
        if (url.includes('/movie/') || url.includes('/tv/')) {
          return { ...item, priority: 0.8, changefreq: 'weekly' };
        }

        return item;
      },
    }),
  ],
});

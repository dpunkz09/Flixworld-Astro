// @ts-check
import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// https://astro.build/config
// Astro 7: output is "static" by default. Pages with `export const prerender = false`
// are rendered on-demand by the Node adapter.
export default defineConfig({
  output: 'static',
  adapter: node({ mode: 'standalone' }),
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
});

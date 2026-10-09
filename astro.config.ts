import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import tailwindcss from '@tailwindcss/vite';
import { SITE_URL } from './src/site.config';

export default defineConfig({
  site: SITE_URL,
  trailingSlash: 'always',
  build: { format: 'directory' },
  server: { port: 4321 },
  integrations: [sitemap({ filter: (page) => !/\.(md|txt|json)$/.test(page) })],
  vite: { plugins: [tailwindcss()] },
});

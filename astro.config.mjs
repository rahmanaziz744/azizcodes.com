// @ts-check
import sitemap from '@astrojs/sitemap';
import { defineConfig } from 'astro/config';

// https://astro.build/config
export default defineConfig({
  // Served from the apex domain by GitHub Pages, so no `base`.
  site: 'https://azizcodes.com',
  // Pages serves `dir/index.html` and redirects `/dir` to `/dir/`. Matching
  // that here keeps one form of every URL in links, canonicals and the sitemap.
  trailingSlash: 'always',
  build: { format: 'directory' },
  // Astro 7 defaults to JSX whitespace rules, which glue adjacent inline links
  // together. `true` compresses without changing what renders.
  compressHTML: true,
  integrations: [sitemap()],
  markdown: {
    shikiConfig: {
      // Chosen for contrast: every token colour these themes use on the site's
      // code background clears WCAG AA (4.5:1). github-light and
      // github-dark-dimmed do not.
      themes: { light: 'github-light-high-contrast', dark: 'github-dark-default' },
      wrap: false,
    },
  },
  image: {
    layout: 'constrained',
    responsiveStyles: true,
  },
});

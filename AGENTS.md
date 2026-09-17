## This site

Personal site for Abdul Rahman Aziz, served at https://azizcodes.com from GitHub
Pages. See README.md for the post format, drafts and DNS.

- Personal details and links come only from `src/config.ts`. Empty values hide
  their links; do not hardcode them in pages.
- `src/lib/posts.ts#getPosts` is the single place drafts are filtered. Every
  list, route and the RSS feed must go through it.
- Posts quote code from github.com/rahmanaziz744/AI-Customer-Support-Assistant.
  Link with commit permalinks, and quote from the committed file
  (`git show <sha>:<path>`), never from an uncommitted working tree.
- Do not publish claims about employment, education or years of experience
  unless the owner has supplied the wording. The resume drafts on disk are
  redacted templates.
- `trailingSlash: 'always'`: internal links end in `/`.

## Development

When starting the dev server, use background mode:

```
astro dev --background
```

Manage the background server with `astro dev stop`, `astro dev status`, and `astro dev logs`.

## Documentation

Full documentation: https://docs.astro.build

Consult these guides before working on related tasks:

- [Adding pages, dynamic routes, or middleware](https://docs.astro.build/en/guides/routing/)
- [Working with Astro components](https://docs.astro.build/en/basics/astro-components/)
- [Using React, Vue, Svelte, or other framework components](https://docs.astro.build/en/guides/framework-components/)
- [Adding or managing content](https://docs.astro.build/en/guides/content-collections/)
- [Adding styles or using Tailwind](https://docs.astro.build/en/guides/styling/)
- [Supporting multiple languages](https://docs.astro.build/en/guides/internationalization/)

# azizcodes.com

Personal site and writing for Abdul Rahman Aziz. Astro, deployed to GitHub Pages
on every push to `main`.

## Run it

```bash
npm install
npm run dev       # http://localhost:4321, drafts visible
npm run build     # production build into dist/, drafts excluded
npm run preview   # serve dist/
```

## Writing a post

Add a Markdown file to `src/content/writing/`. The filename becomes the URL, so
`my-post.md` is served at `/writing/my-post/`.

```yaml
---
title: The title
description: One sentence, under 200 characters. Used in lists, RSS and search results.
pubDate: 2026-09-17
draft: true
tags: [agents]
---
```

A post with `draft: true` shows in `npm run dev` with a Draft badge and is left
out of the production build entirely: no page, no list entry, no RSS item, no
sitemap URL. Set `draft: false` and the publish date on the day it goes out.

Link to code with commit permalinks (`/blob/<sha>/path#L10-L20`), not
`/blob/main/`, so line numbers keep pointing at the right code after the
repository changes.

## Personal details

Name, email and profile links live in `src/config.ts`. A link with an empty
value is not rendered, so LinkedIn and the resume appear once they are filled
in. For the resume, add `public/resume.pdf` and set `resume: '/resume.pdf'`.

## Hosting

GitHub Pages serves the site. DNS is the existing Route 53 hosted zone for
`azizcodes.com`, which also holds the `support` record for the support agent
demo. That record is managed by Terraform in the support agent repository;
the records below are added by hand and are not in any Terraform state.

| Name | Type | Value |
| --- | --- | --- |
| `azizcodes.com` | A | `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` |
| `azizcodes.com` | AAAA | `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153` |
| `www.azizcodes.com` | CNAME | `rahmanaziz744.github.io` |
| `_github-pages-challenge-rahmanaziz744.azizcodes.com` | TXT | Domain verification value from GitHub. Keep it. |

Never create a second hosted zone for `azizcodes.com`. The registrar delegates
to the existing zone, so records in a new one would never resolve.

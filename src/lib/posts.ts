import { getCollection, type CollectionEntry } from 'astro:content';

export type Post = CollectionEntry<'writing'>;

/**
 * Posts, newest first. The only place drafts are filtered, so a draft never
 * gets a page, a list entry, an RSS item or a sitemap URL in production.
 */
export async function getPosts(): Promise<Post[]> {
  const posts = await getCollection('writing', ({ data }) => !import.meta.env.PROD || !data.draft);
  return posts.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
}

export function postPath(post: Post): string {
  return `/writing/${post.id}/`;
}

export function formatDate(date: Date): string {
  // Frontmatter dates parse as UTC midnight; format in UTC so they do not
  // shift a day for readers west of Greenwich.
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

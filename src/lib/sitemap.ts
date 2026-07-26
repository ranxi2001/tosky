import { getCollection } from "astro:content";
import { publishedPosts } from "./posts";

const site = "https://tosky.top";

function escapeXml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

export async function createSitemap() {
  const posts = publishedPosts(await getCollection("blog"));
  const staticPaths = ["/", "/blog/", "/activities/", "/tag/", "/okx/", "/about/"];
  const tags = Array.from(new Set(posts.flatMap((post) => post.data.tags)));
  const entries: Array<{ loc: string; lastmod?: string }> = [
    ...staticPaths.map((path) => ({ loc: new URL(path, site).href })),
    ...posts.filter((post) => !post.data.noindex).map((post) => ({
      loc: new URL(`/blog/${post.id}/`, site).href,
      lastmod: post.data.updatedAt.toISOString(),
    })),
    ...tags.map((tag) => ({ loc: new URL(`/tag/${encodeURIComponent(tag)}/`, site).href })),
  ];
  const urls = entries
    .map(({ loc, lastmod }) => `  <url><loc>${escapeXml(loc)}</loc>${lastmod ? `<lastmod>${lastmod}</lastmod>` : ""}</url>`)
    .join("\n");
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;

  return new Response(body, {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}

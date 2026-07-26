import rss from "@astrojs/rss";
import { getCollection } from "astro:content";
import type { APIContext } from "astro";
import { publishedPosts } from "./posts";

export async function createRss(context: APIContext) {
  const posts = publishedPosts(await getCollection("blog")).filter(
    (post) => !post.data.noindex,
  );

  return rss({
    title: "ToSky",
    description: "Web3 交易所、返佣优惠与链上活动指南。",
    site: context.site ?? "https://tosky.top",
    trailingSlash: true,
    items: posts.map((post) => ({
      title: post.data.title,
      description: post.data.description,
      pubDate: post.data.publishedAt,
      link: `/blog/${post.id}/`,
      categories: [post.data.category, ...post.data.tags],
      customData: `<language>zh-CN</language>`,
    })),
    customData: `<language>zh-CN</language>`,
  });
}

import type { CollectionEntry } from "astro:content";

export type BlogPost = CollectionEntry<"blog">;
export type PostStatus = BlogPost["data"]["status"];
export type PostCategory = BlogPost["data"]["category"];

export const categoryLabels: Record<PostCategory, string> = {
  guide: "指南",
  exchange: "交易所",
  onchain: "链上",
  campaign: "活动",
  analysis: "分析",
};

export const statusLabels: Record<PostStatus, string> = {
  active: "进行中",
  upcoming: "即将开始",
  expired: "已结束",
  evergreen: "有效",
  review: "待复核",
};

export function byPublishedDesc(a: BlogPost, b: BlogPost) {
  return b.data.publishedAt.getTime() - a.data.publishedAt.getTime();
}

export function publishedPosts(posts: BlogPost[]) {
  return posts.filter((post) => !post.data.draft).sort(byPublishedDesc);
}

export function formatDate(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "Asia/Shanghai",
  }).format(date);
}

export function readingMinutes(body: string | undefined) {
  const count = (body ?? "").replace(/\s+/g, "").length;
  return Math.max(1, Math.ceil(count / 500));
}

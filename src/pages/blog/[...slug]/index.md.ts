import type { CollectionEntry } from "astro:content";
import {
  getIndexedEntries,
  renderEntryAsMarkdown,
  type IndexedEntry,
} from "@cloudflare/nimbus-docs";
import { config } from "virtual:nimbus/config";
import { isAgentIndexable } from "../../../lib/indexing";

export const prerender = true;

interface SlugProps {
  item: IndexedEntry;
}

export async function getStaticPaths() {
  return (await getIndexedEntries())
    .filter((item) => item.collection === "blog" && isAgentIndexable(item))
    .map((item) => ({
      params: { slug: item.entry.id },
      props: { item } as SlugProps,
    }));
}

export function GET({ props }: { props: SlugProps }) {
  const { item } = props;
  const entry = item.entry as CollectionEntry<"blog">;
  const { data } = entry;
  const markdown = renderEntryAsMarkdown(entry);
  const sourceUrl = new URL(item.sourceUrl ?? item.markdownUrl, config.site).href;
  const lines = [
    "---",
    `title: ${JSON.stringify(data.title)}`,
    ...(data.description ? [`description: ${JSON.stringify(data.description)}`] : []),
    `publishedAt: ${JSON.stringify(data.publishedAt.toISOString())}`,
    `updatedAt: ${JSON.stringify(data.updatedAt.toISOString())}`,
    ...(data.lastVerifiedAt
      ? [`lastVerifiedAt: ${JSON.stringify(data.lastVerifiedAt.toISOString())}`]
      : []),
    `author: ${JSON.stringify(data.author)}`,
    `category: ${JSON.stringify(data.category)}`,
    `status: ${JSON.stringify(data.status)}`,
    `tags: ${JSON.stringify(data.tags)}`,
    ...(data.exchange ? [`exchange: ${JSON.stringify(data.exchange)}`] : []),
    ...(data.chain ? [`chain: ${JSON.stringify(data.chain)}`] : []),
    `regions: ${JSON.stringify(data.regions)}`,
    ...(data.startsAt ? [`startsAt: ${JSON.stringify(data.startsAt.toISOString())}`] : []),
    ...(data.expiresAt ? [`expiresAt: ${JSON.stringify(data.expiresAt.toISOString())}`] : []),
    ...(data.affiliateKey ? [`affiliateKey: ${JSON.stringify(data.affiliateKey)}`] : []),
    `editorialQa: ${JSON.stringify(data.editorialQa)}`,
    `sources: ${JSON.stringify(data.sources)}`,
    `canonical: ${JSON.stringify(new URL(item.url, config.site).href)}`,
    `image: ${JSON.stringify(new URL(data.socialImage ?? `/og/blog/${entry.id}.png`, config.site).href)}`,
    "---",
    "",
    `> Agent index: ${new URL("/blog/llms.txt", config.site).href}`,
    "> 本文涉及交易所、返佣或链上活动时，请优先核验状态、时间、地区限制与来源。",
    "",
    `# ${data.title}`,
    "",
    markdown,
  ];

  lines.push(
    "",
    "## 常见问题解答",
    "",
    "> 关于本页内容的热门问题，来自社区用户的提问与解答。",
  );
  for (const item of data.editorialQa) {
    lines.push("", `### ${item.question}`, "", item.answer);
  }

  if (data.riskDisclosure) {
    lines.push("", "## 风险提示", "", data.riskDisclosure);
  }

  if (data.sources.length > 0) {
    lines.push("", "## 来源与核验", "");
    for (const source of data.sources) {
      lines.push(`- [${source.label}](${source.url})`);
    }
  }

  lines.push("", `Raw source: ${sourceUrl}`, "");

  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

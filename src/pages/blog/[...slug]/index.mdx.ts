import type { CollectionEntry } from "astro:content";
import { getIndexedEntries, type IndexedEntry } from "@cloudflare/nimbus-docs";
import { isAgentIndexable } from "../../../lib/indexing";

export const prerender = true;

interface SlugProps {
  item: IndexedEntry;
}

export async function getStaticPaths() {
  return (await getIndexedEntries())
    .filter(
      (item) =>
        item.collection === "blog" &&
        item.sourceUrl !== undefined &&
        isAgentIndexable(item),
    )
    .map((item) => ({
      params: { slug: item.entry.id },
      props: { item } as SlugProps,
    }));
}

export function GET({ props }: { props: SlugProps }) {
  const entry = props.item.entry as CollectionEntry<"blog">;
  const { data } = entry;
  const body = [
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
    `cover: ${JSON.stringify(data.cover)}`,
    `coverAlt: ${JSON.stringify(data.coverAlt)}`,
    `featured: ${JSON.stringify(data.featured)}`,
    ...(data.startsAt ? [`startsAt: ${JSON.stringify(data.startsAt.toISOString())}`] : []),
    ...(data.expiresAt ? [`expiresAt: ${JSON.stringify(data.expiresAt.toISOString())}`] : []),
    ...(data.exchange ? [`exchange: ${JSON.stringify(data.exchange)}`] : []),
    ...(data.chain ? [`chain: ${JSON.stringify(data.chain)}`] : []),
    `regions: ${JSON.stringify(data.regions)}`,
    ...(data.affiliateKey ? [`affiliateKey: ${JSON.stringify(data.affiliateKey)}`] : []),
    ...(data.riskDisclosure
      ? [`riskDisclosure: ${JSON.stringify(data.riskDisclosure)}`]
      : []),
    `editorialQa: ${JSON.stringify(data.editorialQa)}`,
    `sources: ${JSON.stringify(data.sources)}`,
    ...(data.legacyWispId ? [`legacyWispId: ${JSON.stringify(data.legacyWispId)}`] : []),
    ...(data.socialImage ? [`socialImage: ${JSON.stringify(data.socialImage)}`] : []),
    ...(data.sidebar !== undefined ? [`sidebar: ${JSON.stringify(data.sidebar)}`] : []),
    ...(data.tableOfContents !== undefined
      ? [`tableOfContents: ${JSON.stringify(data.tableOfContents)}`]
      : []),
    ...(data.searchable !== undefined
      ? [`searchable: ${JSON.stringify(data.searchable)}`]
      : []),
    ...(data.head.length > 0 ? [`head: ${JSON.stringify(data.head)}`] : []),
    `draft: ${JSON.stringify(data.draft)}`,
    `noindex: ${JSON.stringify(data.noindex)}`,
    "---",
    "",
    entry.body ?? "",
    "",
  ].join("\n");

  return new Response(body, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}

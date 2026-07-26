import { getCollection } from "astro:content";
import { OGImageRoute } from "astro-og-canvas";
import { categoryLabels, statusLabels } from "../../../lib/posts";
import { ogCardConfig } from "../_og-card-config";

const entries = await getCollection("blog", (entry) => !entry.data.draft);
const pages = Object.fromEntries(
  entries.map((entry) => [
    entry.id,
    {
      title: entry.data.title,
      description: `${categoryLabels[entry.data.category]} · ${statusLabels[entry.data.status]} · ${entry.data.description ?? "ToSky Web3 交易与链上活动指南"}`,
    },
  ]),
);

export const { getStaticPaths, GET } = await OGImageRoute({
  pages,
  getImageOptions: (_path, page) => ({
    ...ogCardConfig,
    bgGradient: [[11, 11, 12]],
    title: page.title,
    description: page.description,
  }),
});

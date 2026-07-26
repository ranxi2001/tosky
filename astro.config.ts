import { defineConfig } from "astro/config";
import icon from "astro-icon";
import tailwindcss from "@tailwindcss/vite";
import nimbus, { defineConfig as defineNimbusConfig } from "@cloudflare/nimbus-docs";
import { tableScroll } from "@cloudflare/nimbus-docs/markdown";
import { externalLinkPolicy } from "./src/lib/affiliate-links";

const nimbusConfig = defineNimbusConfig({
  site: "https://tosky.top",
  title: "ToSky",
  description: "Web3 交易所、返佣优惠与链上活动指南。",
  locale: "zh-CN",
  homeLabel: "首页",
  github: "https://github.com/ranxi2001/tosky",
  editPattern: "https://github.com/ranxi2001/tosky/edit/main/src/content/{path}",
  socialImageAlt: "ToSky Web3 活动与交易指南",
  search: {
    provider: "pagefind",
    placeholder: "搜索文章、交易所或链上活动",
  },
});

export default defineConfig({
  output: "static",
  vite: {
    plugins: [tailwindcss()],
  },
  prefetch: {
    defaultStrategy: "hover",
  },
  integrations: [
    icon(),
    nimbus(nimbusConfig, {
      sitemap: false,
      rules: {
        "nimbus/frontmatter-shape": "error",
        "nimbus/internal-link": "error",
        "nimbus/single-h1": "error",
        "nimbus/heading-hierarchy": "warn",
        "nimbus/bare-url": "warn",
      },
      markdown: {
        hastPlugins: [tableScroll(), externalLinkPolicy()],
      },
    }),
  ],
});

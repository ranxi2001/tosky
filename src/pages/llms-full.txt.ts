import {
  getIndexedEntries,
  renderEntryAsMarkdown,
} from "@cloudflare/nimbus-docs";
import { config } from "virtual:nimbus/config";
import { isAgentIndexable } from "../lib/indexing";

export const prerender = true;

export async function GET() {
  const entries = (await getIndexedEntries())
    .filter(isAgentIndexable)
    .sort((a, b) => a.url.localeCompare(b.url));
  const lines = [
    `# ${config.title}`,
    "",
    config.description ?? "",
    "",
    `Agent index: ${new URL("/llms.txt", config.site).href}`,
  ];

  for (const item of entries) {
    lines.push(
      "",
      "---",
      "",
      `## ${item.title}`,
      "",
      ...(item.description ? [item.description, ""] : []),
      `Page: ${new URL(item.url, config.site).href}`,
      `Markdown: ${new URL(item.markdownUrl, config.site).href}`,
      "",
      renderEntryAsMarkdown(item.entry),
    );
  }

  lines.push("");
  return new Response(lines.join("\n"), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

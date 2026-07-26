import type { IndexedEntry } from "@cloudflare/nimbus-docs";

export function isAgentIndexable(item: IndexedEntry) {
  const data = item.entry.data as { draft?: boolean; noindex?: boolean };
  return data.draft !== true && data.noindex !== true;
}

import type { HastPluginDefinition } from "satteri";

const referralSignals = [
  "/join/",
  "channelId=",
  "?ref=",
  "&ref=",
  "joindex?",
  "onefly.top/posts/8888",
  "onefly.top/posts/24219",
];

type HastElement = {
  type: "element";
  tagName: string;
  properties?: Record<string, unknown> | null;
  children?: unknown[];
};

export function externalLinkPolicy(): HastPluginDefinition {
  const plugin = {
    name: "tosky:external-link-policy",
    element: {
      filter: ["a"],
      visit(node: HastElement) {
        const href = node.properties?.href;
        if (typeof href !== "string" || !/^https?:\/\//i.test(href)) return;

        const sponsored = referralSignals.some((signal) => href.includes(signal));
        return {
          ...node,
          properties: {
            ...node.properties,
            target: "_blank",
            rel: sponsored
              ? ["sponsored", "nofollow", "noopener", "noreferrer"]
              : ["noopener", "noreferrer"],
          },
        } as HastElement;
      },
    },
  };

  return plugin as unknown as HastPluginDefinition;
}

import { defineCollection } from "astro:content";
// `z` re-exported from `astro:content` is deprecated; import it from
// `astro/zod` (the pattern nimbus-docs' own schema helpers document).
import { z } from "astro/zod";
import { docsCollection, partialsCollection } from "@cloudflare/nimbus-docs/content";

export const collections = {
  docs: defineCollection(
    docsCollection({
      schemaFields: {
        audience: z.literal("human").optional(),
        affiliateKey: z.string().optional(),
      },
    }),
  ),
  blog: defineCollection(
    docsCollection({
      base: "blog",
      schemaFields: {
        publishedAt: z.coerce.date(),
        updatedAt: z.coerce.date(),
        lastVerifiedAt: z.coerce.date().optional(),
        author: z.string().default("onefly"),
        category: z.enum(["guide", "exchange", "onchain", "campaign", "analysis"]),
        tags: z.array(z.string()).default([]),
        cover: z.string(),
        coverAlt: z.string().min(4),
        featured: z.boolean().default(false),
        status: z.enum(["active", "upcoming", "expired", "evergreen", "review"]),
        startsAt: z.coerce.date().optional(),
        expiresAt: z.coerce.date().optional(),
        exchange: z.string().optional(),
        chain: z.string().optional(),
        regions: z.array(z.string()).default([]),
        affiliateKey: z.string().optional(),
        riskDisclosure: z.string().optional(),
        editorialQa: z
          .array(
            z.object({
              question: z.string().trim().min(4),
              answer: z.string().trim().min(8),
            }),
          )
          .min(2)
          .max(4),
        sources: z
          .array(
            z.object({
              label: z.string(),
              url: z.url(),
            }),
          )
          .default([]),
        legacyWispId: z.string().optional(),
      },
    }),
  ),
  partials: defineCollection(partialsCollection()),
};

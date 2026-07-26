# Repository Guidelines

## Project Structure & Module Organization

ToSky is an Astro 7 static Web3 content site deployed through Cloudflare Workers Static Assets. Blog posts live in `src/content/blog/`; fixed guides and reusable content are in `src/content/docs/` and `src/content/partials/`. UI code is organized under `src/components/`, `src/layouts/`, and `src/pages/`; shared logic belongs in `src/lib/`, configuration data in `src/data/`, and styles in `src/styles/`. Store article covers and inline images in `public/images/posts/`. Scripts for scaffolding and validation live in `scripts/`. Never edit generated `dist/` output.

## Build, Test, and Development Commands

- `npm ci`: install the committed lockfile with Node.js 22.12 or newer.
- `npm run dev`: start the local Astro development server.
- `npm run new:post -- <slug> --title "Title" --category campaign`: scaffold a draft post.
- `npm run typecheck`: run Astro and TypeScript diagnostics.
- `npm run lint:docs`: validate Nimbus Markdown conventions.
- `npm run check:content`: validate frontmatter, dates, covers, and referral usage.
- `npm run check`: run every required pre-merge check and build the static site.
- `npm run preview:cf`: build and preview the Cloudflare Worker locally.

## Coding Style & Naming Conventions

Follow surrounding TypeScript and Astro style: two-space indentation, double quotes, trailing commas, and strict types. Use `@/` imports for code under `src/`. Name Astro components in PascalCase, utilities descriptively, and article slugs with lowercase kebab-case. Published slugs are permanent. Use `astro-icon` Phosphor icons and register MDX components in `src/components.ts`. Avoid unrelated formatting changes.

## Testing Guidelines

There is no separate unit-test suite or coverage threshold. `npm run check` is the mandatory quality gate after every content or code change. For UI changes, inspect desktop and mobile layouts; include screenshots in pull requests. Run `npm run check:production` only against a deployed production URL.

## Commit & Pull Request Guidelines

History follows concise Conventional Commit prefixes such as `feat:`, `fix:`, `docs:`, `chore:`, and `security:`. Keep commits focused. Pull requests should explain the behavior or content changed, list verification commands, link relevant issues or official sources, and include screenshots for visual work.

## Content, Images, and Security

Read and follow `AGENT.md` before editing. Keep covers and body images local, use descriptive alt text, and reference them as `/images/posts/...`. Never commit secrets or `.env` files. Do not change verified discount rates, invite codes, referral disclosure behavior, or existing article slugs without explicit owner approval.

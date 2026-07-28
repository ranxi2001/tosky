# ToSky

ToSky 是面向 Web3 交易所、链上活动与返佣信息的中文静态博客。项目基于 [Astro](https://astro.build/) 与 [Cloudflare Nimbus](https://github.com/cloudflare/nimbus)，文章使用仓库内 Markdown 管理，构建结果是可直接发布到 Cloudflare Workers Static Assets 的纯静态文件。

站点不再依赖 Wisp CMS 或运行时数据库。内容、图片、SEO 元数据与返佣配置都可以由编辑者或 Agent 通过文件直观维护，并进入同一套版本审查与自动检查流程。

## 技术架构

- Astro 静态输出：页面在构建时生成到 `dist/`，线上无需 Node 服务。
- `@cloudflare/nimbus-docs`：提供内容页、Markdown 规则、搜索与站点基础能力。
- Astro Content Collections：`src/content.config.ts` 统一约束文章字段与类型。
- Pagefind：对构建后的静态页面建立本地搜索索引。
- Cloudflare Workers Static Assets：`wrangler.jsonc` 将 `dist/` 作为静态资源发布。
- 集中返佣配置：所有邀请入口维护在 `src/data/referrals.json`，正文不硬编码跟踪链接。

关键目录：

```text
src/content/blog/       博客 Markdown；文件名就是永久 slug
src/content/docs/       固定指南与关于页面
src/data/referrals.json 返佣入口、邀请码与披露文案
public/images/posts/    文章本地封面和正文图片
scripts/                内容检查与文章脚手架
dist/                   构建产物（不手工编辑）
```

## 本地开发

要求 Node.js 22.12 或更高版本。

```bash
npm ci
npm run dev
```

开发地址以终端输出为准。常用命令：

```bash
npm run typecheck       # Astro 与 TypeScript 类型检查
npm run lint:docs       # Nimbus Markdown/文档规则
npm run check:content   # 文章字段、封面、时效与返佣链接检查
npm run build           # 生成 dist 和 Pagefind 索引
npm run check           # 发布前完整检查
```

## 新建与撰写文章

slug 是发布 URL 的一部分，必须使用小写字母、数字和单连字符；一旦发布不要修改。

```bash
# 参数化创建
npm run new:post -- okx-new-campaign --title "OKX 新活动说明" --category campaign

# 在真实终端中进入引导式填写
npm run new:post -- base-onchain-guide

# 查看全部可用参数
npm run new:post -- --help
```

生成器会创建 `draft: true`、`noindex: true` 的 Markdown 草稿，并给出适合 Agent 写作的回答优先结构。默认封面是 `/images/posts/<slug>.jpg`；添加对应本地图片后再运行内容检查。

发布前至少完成以下内容：

1. 用明确结论开篇，说明活动或规则当前是否有效。
2. 填写参与对象、地区、起止时间、费用、奖励、步骤与风险。
3. 将可核验的一手资料加入 `sources`，并更新 `lastVerifiedAt`。
4. 活动使用 `active`、`upcoming` 或 `expired`；长期指南使用 `evergreen`；待复核旧文使用 `review`。
5. 将封面放到 `public/images/posts/`，使用描述实际画面的 `coverAlt`。
6. 填写 2-4 组 `editorialQa`，用编辑身份直接回答真实搜索问题。
7. 准备发布时设置 `draft: false`；需要收录时再设置 `noindex: false`。

核心 frontmatter 示例：

```yaml
---
title: "文章标题"
description: "一句可独立理解的搜索摘要"
publishedAt: "2026-07-26T08:00:00.000Z"
updatedAt: "2026-07-26T08:00:00.000Z"
lastVerifiedAt: "2026-07-26T08:00:00.000Z"
author: "onefly"
category: "campaign"
tags: ["okx", "onchain"]
cover: "/images/posts/example.jpg"
coverAlt: "活动规则页面与奖励信息"
featured: false
status: "active"
startsAt: "2026-07-25T00:00:00.000Z"
expiresAt: "2026-08-01T00:00:00.000Z"
regions: []
affiliateKey: "okx"
riskDisclosure: "奖励和资格可能变化，参与前请核验官方规则。"
editorialQa:
  - question: "这项活动现在还能参加吗？"
    answer: "可以，当前状态为进行中；参与前仍需核对结束时间和地区限制。"
  - question: "奖励是否保证获得？"
    answer: "不保证，资格审核、名额和发放结果均以官方规则为准。"
sources:
  - label: "官方活动规则"
    url: "https://example.com/official-rules"
draft: false
noindex: false
---
```

`expiresAt` 已经过期时，`status` 必须是 `expired`；`upcoming` 必须提供未来的 `startsAt`。`npm run check:content` 会同时验证必需字段、本地封面文件、日期关系、`editorialQa` 数量、`affiliateKey` 是否存在，以及正文是否出现硬编码邀请链接。`sources` 中允许保留活动规则与资料 URL。

`editorialQa` 会显示为“常见问题与编辑答疑”。它不是评论系统：不得添加虚构昵称、游客、设备、IP、所在地、时间或互动数量，也不要把编辑整理的问题伪装成用户留言。

## OKX 官方活动自动同步

同步器读取 [OKX Latest events](https://www.okx.com/zh-hans/help/section/latest-events) 中文官方页面内的结构化列表，不复制活动正文，也不使用第三方聚合数据。固定语言路径可以避免 GitHub Runner 按出口地区落到没有活动数据的美区页面。首次运行会把现有列表建立为基线，并为最新一条符合活动关键词的记录生成可收录文章；后续每个 PR 最多新增一篇。生成页已经设置 `draft: false`、`noindex: false`，但自动化只创建草稿 PR，合并后才会发布和进入 Sitemap、RSS、Pagefind 与 Agent 语料。

本地检查数据与输出：

```bash
npm run sync:okx -- --dry-run
npm run test:okx-sync
```

定时任务位于 `.github/workflows/sync-okx-activities.yml`，按 Asia/Shanghai 时区每 6 小时运行，并使用固定的 `automation/okx-activity-sync` 分支维护一个草稿 PR。任务会先运行完整的 `npm run check`；无新活动时不创建空 PR，也不会直推或自动合并 `main`。机器状态保存在 `src/data/okx-activity-sync.json`，官方 ID 到永久 slug 的映射不得删除。

为让自动 PR 正常触发现有校验，需要创建一个只安装到本仓库的 GitHub App，并授予 `Contents: Read and write`、`Pull requests: Read and write` 与 `Metadata: Read`。随后配置：

```text
OKX_SYNC_APP_CLIENT_ID   Repository variable，GitHub App Client ID
OKX_SYNC_APP_PRIVATE_KEY Repository secret，GitHub App private key
```

可先从 Actions 手动运行 `Sync OKX official activities` 并勾选 `dry_run`。GitHub App 使用短期安装令牌；不需要在仓库保存 PAT。合并前仍须核对地区、资格、起止时间、奖励和风险，明确的信息应补入正文与 frontmatter。

### 返佣链接

不要在 Markdown 正文中粘贴注册链接、邀请码参数或渠道链接。只需设置已定义的 `affiliateKey`，展示组件会从 `src/data/referrals.json` 取出入口，并统一添加返佣披露与链接属性。

当前已经由项目所有者验证的标准是：OKX 邀请码 `88596413`，终身最高 20% 官方手续费返佣（手续费八折）；Binance 邀请码 `TOSKY`，10% 手续费优惠；OKX DEX 邀请码 `ONEFLY`，20% 服务费优惠。除非项目所有者明确要求，不要修改或弱化这些比例与邀请码。

需要新增平台时，先在 `src/data/referrals.json` 添加配置，再在文章中引用其 key。普通官方帮助页放入 `sources`，不要把来源和返佣入口混为一体。

## SEO 与 GEO 写作约定

- 每篇文章只回答一个清晰主题，标题和 `description` 使用读者真实查询语言。
- 开头先给答案；关键金额、日期、资格和链名使用可直接抽取的完整句子或列表。
- 用 `sources` 支撑易变化的事实，用 `lastVerifiedAt` 表明信息新鲜度。
- 过期活动保留历史页面和原 URL，但明确标记已结束，不删除有搜索价值的内容。
- 不承诺收益，不隐藏地区、托管、合约与价格风险；返佣关系必须披露。

## Cloudflare Workers 部署

生产部署由 `.github/workflows/deploy.yml` 管理。Pull Request 会执行完整检查；推送到 `main` 或在 GitHub Actions 中手动运行工作流时，会构建并发布到 `https://tosky.top`，随后检查 canonical、文章页、RSS、Sitemap、`llms.txt` 和旧路径重定向。

首次启用前，在 GitHub 仓库的 **Settings > Secrets and variables > Actions** 中添加：

```text
CLOUDFLARE_ACCOUNT_ID  Cloudflare Workers 所在账户 ID
CLOUDFLARE_API_TOKEN   限定到该账户和 tosky.top 的部署 Token
```

API Token 使用 Cloudflare 的 **Edit Cloudflare Workers** 自定义模板，并把 Account 与 Zone Resources 限制到当前项目。不要把 Token 写进仓库、`.env` 或 Actions 日志。

本机仍可在 Wrangler 登录后手动部署：

```bash
npx wrangler login
npm run deploy
```

`npm run deploy` 会先执行完整的 `npm run check`，通过后由 Wrangler 上传 `dist/`。本地模拟 Workers Static Assets：

```bash
npm run preview:cf
```

使用 Cloudflare Workers Builds 而非 GitHub Actions 时可配置：

```text
Build command:  npm run check
Deploy command: npx wrangler deploy
Preview command: npx wrangler versions upload
```

`wrangler.jsonc` 会将根域绑定为 Worker Custom Domain，并让 `www.tosky.top` 以 308 保留路径和查询参数跳转到根域。站点正文仍是纯静态输出，不需要 Wisp 环境变量、数据库绑定或 Astro Cloudflare adapter。

## 迁移与 URL 稳定性

根路径 `/` 使用 `src/content/docs/okx.mdx` 的 OKX 指南内容，`/okx/` 永久重定向到根路径；综合内容首页位于 `/home/`。

原 Wisp 内容已经迁入 `src/content/blog/`。博客路由继续使用 `/blog/<slug>/`，因此下列既有 slug 必须保留：

```text
hyperliquidokx
i-love-okx
okx-and-binance-discount
okx-c2c
okx-dex-20percent
okx-wlfi-and-usd1
okxnightapy
okxpump
```

Cloudflare 对 `/blog/<slug>` 与 `/blog/<slug>/` 做静态 HTML 解析；站内链接统一使用带尾斜杠的规范 URL。迁移后不要重命名这些 Markdown 文件。确需改 slug 时，必须先添加永久重定向并保留原地址，避免搜索权重和外部链接失效。

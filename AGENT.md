# ToSky Agent 发布契约

本项目是 Astro + Cloudflare Nimbus 的纯静态 Web3 内容站。文章、图片、SEO/GEO 字段和返佣配置都在仓库内维护，不连接 Wisp 或运行时数据库。

## 发文入口

优先使用脚手架，不要复制旧文章改名：

```bash
npm run new:post -- <slug> --title "文章标题" --category campaign
```

随后编辑 `src/content/blog/<slug>.md`，把封面放到 `public/images/posts/`。文件名就是永久 URL `/blog/<slug>/`，发布后不得随意修改。

发布前必须运行：

```bash
npm run check
```

## 不可擅改的业务事实

- OKX CEX 邀请标准：邀请码 `88596413`，终身最高 `20%` 官方手续费返佣，即手续费八折。
- Binance 邀请标准：邀请码 `TOSKY`，`10%` 手续费优惠。
- OKX DEX 邀请标准：邀请码 `ONEFLY`，`20%` 服务费优惠。
- 以上标准由项目所有者验证。除非项目所有者明确要求，不得弱化、推测、改写比例或邀请码。
- 跳转 URL 只在 `src/data/referrals.json` 更新。Markdown 正文不得硬编码返佣 URL；正文可以写已验证比例。

## 内容规则

- 一个页面回答一个明确查询，开头先给当前结论。
- 活动必须写清参与对象、地区、链、开始/结束时间、费用、奖励、步骤和风险。
- 易变化的事实优先使用交易所、协议或项目方一手来源，并写入 `sources`。
- 更新事实时同步更新 `updatedAt`；完成核验时同步更新 `lastVerifiedAt`。
- 已结束活动使用 `status: expired` 并保留原 slug；未确认旧内容使用 `status: review`，不得伪装成进行中。
- 不承诺收益，不把返佣或空投描述成无风险收入。
- 封面和正文图片必须本地化，所有图片必须有描述实际画面的 alt 文本。
- 正文不重复 H1；页面 H1 来自 frontmatter 的 `title`。
- 每篇文章和活动必须填写 2-4 组 `editorialQa`，问题来自真实搜索意图，答案由 ToSky 编辑核验并明确适用范围。
- `editorialQa` 是公开的编辑答疑，不是用户评论。不得伪造昵称、游客身份、手机型号、IP、所在地、时间、点赞或其他互动数据。

## Frontmatter

`src/content.config.ts` 是字段契约。博客至少需要：

- `title`、`description`、`publishedAt`、`updatedAt`、`author`
- `category`、`tags`、`cover`、`coverAlt`
- `status`、`regions`、`riskDisclosure`、`sources`
- `editorialQa`（2-4 组，仅含 `question` 与 `answer`）
- `draft`、`noindex`

活动状态只能使用 `active`、`upcoming`、`expired`、`evergreen`、`review`。`upcoming` 必须提供未来的 `startsAt`；已有过去的 `expiresAt` 必须标记为 `expired`。

## 返佣与来源

设置 `affiliateKey` 后，文章页会从 `src/data/referrals.json` 自动展示合作卡片，并输出 `rel="sponsored nofollow noopener noreferrer"`。普通官方规则链接放进 `sources`，不要把来源 URL 和返佣入口混为一体。

## Agent 与搜索表面

- 公开文章自动生成 HTML、`index.md`、`index.mdx`、BlogPosting JSON-LD 和 OG 图片。
- `/llms.txt`、`/llms-full.txt` 与 `/blog/llms.txt` 供 Agent 发现内容。
- `draft: true` 或 `noindex: true` 的内容不得进入 RSS、Sitemap、Pagefind 或 Agent 语料。
- 原有文章 slug、`/tag/`、`/rss`、`/api/sitemap` 和 `/okx/` 是稳定路径。

## OKX 官方活动同步

- `npm run sync:okx` 只读取 `https://www.okx.com/zh-hans/help/section/latest-events` 的结构化列表；固定中文语言路径以避免按 GitHub Runner 出口地区返回空列表，不得改成转载第三方活动聚合页。
- 自动文章使用 `okx-event-*` 永久 slug，并保留 `syncProvider`、`syncSourceId`、`syncSourceUrl`、来源时间和哈希字段。不要手工删除这些溯源字段或修改 `src/data/okx-activity-sync.json` 的 ID 映射。
- 同步文章在 PR 中已经是 `draft: false`、`noindex: false`；PR 是发布闸门，合并后才会进入生产索引。不得让同步工作流直推或自动合并 `main`。
- 自动正文只陈述官方列表可验证的来源、标题和时间，不推测地区、资格、截止时间或奖励。合并前应打开官方详情页补齐这些字段；有明确起止时间时同步设置 `startsAt`、`expiresAt` 和正确状态。
- 同步器不会覆盖已经生成的 Markdown。官方标题或更新时间变化只更新状态索引，由编辑决定是否修改正文。
- 自动文章不设置 `affiliateKey`。需要返佣入口时仍按既有披露策略人工添加，正文不得粘贴邀请链接。

## 代码约定

- MDX 组件必须在 `src/components.ts` 注册。
- 图标使用 `astro-icon` 的 Phosphor 图标。
- Nimbus 使用 Satteri Markdown 处理器；AST 插件必须使用 `HastPluginDefinition`，不能直接传 Unified transformer。
- 使用 npm 与已提交的 `package-lock.json`，不要改用 pnpm、yarn 或 bun。
- 不要编辑 `dist/`；它由 `npm run build` 生成。

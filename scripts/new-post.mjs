#!/usr/bin/env node

import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { createInterface } from "node:readline/promises";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const blogRoot = path.join(projectRoot, "src/content/blog");
const referralsPath = path.join(projectRoot, "src/data/referrals.json");
const categories = ["guide", "exchange", "onchain", "campaign", "analysis"];
const statuses = ["review", "evergreen", "active", "upcoming", "expired"];
const optionNames = new Set([
  "affiliate-key",
  "category",
  "chain",
  "cover",
  "cover-alt",
  "description",
  "exchange",
  "expires-at",
  "help",
  "interactive",
  "regions",
  "slug",
  "starts-at",
  "status",
  "tags",
  "title",
]);

const usage = `用法：
  npm run new:post -- <slug> [--title "文章标题"] [选项]

选项：
  --description <文本>       SEO/GEO 摘要
  --category <类型>          ${categories.join(" | ")}
  --status <状态>            ${statuses.join(" | ")}
  --cover <路径>             public 下的本地路径，默认 /images/posts/<slug>.jpg
  --cover-alt <文本>         封面替代文本
  --tags <a,b>               逗号分隔标签
  --regions <a,b>            逗号分隔地区
  --affiliate-key <key>      src/data/referrals.json 中的键
  --exchange <名称>          交易所名称
  --chain <名称>             链名称
  --starts-at <ISO 日期>     活动开始时间
  --expires-at <ISO 日期>    活动结束时间
  --interactive              即使已传 title 也进入引导式填写
  --help                     显示帮助

示例：
  npm run new:post -- okx-new-campaign --title "OKX 新活动说明" --category campaign
  npm run new:post -- base-onchain-guide`;

function parseArguments(argv) {
  const options = {};
  const positional = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (!argument.startsWith("--")) {
      positional.push(argument);
      continue;
    }

    const [rawKey, inlineValue] = argument.slice(2).split(/=(.*)/s, 2);
    if (!optionNames.has(rawKey)) throw new Error(`无法识别参数：--${rawKey}`);
    if (["help", "interactive"].includes(rawKey)) {
      options[rawKey] = true;
      continue;
    }

    const value = inlineValue ?? argv[index + 1];
    if (!value || (inlineValue === undefined && value.startsWith("--"))) {
      throw new Error(`--${rawKey} 缺少值`);
    }
    options[rawKey] = value;
    if (inlineValue === undefined) index += 1;
  }

  if (positional.length > 1) throw new Error(`无法识别参数：${positional.slice(1).join(" ")}`);
  if (options.slug && positional[0]) throw new Error("slug 只能传一次");
  return { slug: options.slug ?? positional[0], options };
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

function yamlList(value) {
  const entries = String(value ?? "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
  return JSON.stringify(entries);
}

function validDate(value) {
  return !value || !Number.isNaN(new Date(value).getTime());
}

async function ask(terminal, label, fallback = "") {
  const suffix = fallback ? ` [${fallback}]` : "";
  const answer = (await terminal.question(`${label}${suffix}: `)).trim();
  return answer || fallback;
}

async function collectInteractively(slug, options) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    if (!options.title) throw new Error("非交互环境必须传入 --title");
    return options;
  }

  const terminal = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const title = await ask(terminal, "标题", options.title ?? "");
    if (!title) throw new Error("标题不能为空");
    const description = await ask(
      terminal,
      "一句话摘要",
      options.description ?? `${title}的参与条件、步骤、时效与风险说明。`,
    );
    const category = await ask(terminal, `分类 (${categories.join("/")})`, options.category ?? "guide");
    const status = await ask(terminal, `状态 (${statuses.join("/")})`, options.status ?? "review");
    const cover = await ask(terminal, "封面路径", options.cover ?? `/images/posts/${slug}.jpg`);
    const coverAlt = await ask(terminal, "封面替代文本", options["cover-alt"] ?? `${title}封面`);
    const tags = await ask(terminal, "标签（逗号分隔，可留空）", options.tags ?? "");
    const affiliateKey = await ask(terminal, "返佣配置 key（可留空）", options["affiliate-key"] ?? "");

    return {
      ...options,
      title,
      description,
      category,
      status,
      cover,
      "cover-alt": coverAlt,
      tags,
      "affiliate-key": affiliateKey,
    };
  } finally {
    terminal.close();
  }
}

async function fileExists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const { slug, options: parsedOptions } = parseArguments(process.argv.slice(2));
  if (parsedOptions.help) {
    console.log(usage);
    return;
  }
  if (!slug) throw new Error(`slug 参数必需\n\n${usage}`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(slug)) {
    throw new Error("slug 只能包含小写字母、数字和单连字符，例如 okx-new-campaign");
  }

  const shouldPrompt = parsedOptions.interactive || !parsedOptions.title;
  const options = shouldPrompt ? await collectInteractively(slug, parsedOptions) : parsedOptions;
  const title = String(options.title ?? "").trim();
  if (!title) throw new Error("标题不能为空；请传 --title 或在终端中交互填写");

  const category = options.category ?? "guide";
  const status = options.status ?? "review";
  if (!categories.includes(category)) throw new Error(`category 必须是：${categories.join(", ")}`);
  if (!statuses.includes(status)) throw new Error(`status 必须是：${statuses.join(", ")}`);
  if (!validDate(options["starts-at"])) throw new Error("--starts-at 不是有效日期");
  if (!validDate(options["expires-at"])) throw new Error("--expires-at 不是有效日期");

  const now = new Date();
  const startsAt = options["starts-at"] ? new Date(options["starts-at"]) : undefined;
  const expiresAt = options["expires-at"] ? new Date(options["expires-at"]) : undefined;
  if (startsAt && expiresAt && startsAt >= expiresAt) {
    throw new Error("--starts-at 必须早于 --expires-at");
  }
  if (status === "upcoming" && !startsAt) {
    throw new Error("status 为 upcoming 时必须传 --starts-at");
  }
  if (status === "upcoming" && startsAt <= now) {
    throw new Error("status 为 upcoming 时 --starts-at 必须晚于当前时间");
  }
  if (status === "active" && startsAt && startsAt > now) {
    throw new Error("活动尚未开始，status 应使用 upcoming");
  }
  if (expiresAt && expiresAt <= now && status !== "expired") {
    throw new Error("活动已经过期，status 应使用 expired");
  }
  if (expiresAt && expiresAt > now && status === "expired") {
    throw new Error("活动尚未过期，status 不能使用 expired");
  }

  const referrals = JSON.parse(await readFile(referralsPath, "utf8"));
  const affiliateKey = String(options["affiliate-key"] ?? "").trim();
  if (affiliateKey && !(affiliateKey in referrals)) {
    throw new Error(`affiliate-key 未定义，可用值：${Object.keys(referrals).join(", ")}`);
  }

  const target = path.join(blogRoot, `${slug}.md`);
  if (await fileExists(target)) throw new Error(`文章已存在：src/content/blog/${slug}.md`);

  const timestamp = now.toISOString();
  const description = options.description ?? `${title}的参与条件、步骤、时效与风险说明。`;
  const cover = options.cover ?? `/images/posts/${slug}.jpg`;
  const coverAlt = options["cover-alt"] ?? `${title}封面`;
  const optionalFields = [
    options["starts-at"] && `startsAt: ${yamlString(options["starts-at"])}`,
    options["expires-at"] && `expiresAt: ${yamlString(options["expires-at"])}`,
    options.exchange && `exchange: ${yamlString(options.exchange)}`,
    options.chain && `chain: ${yamlString(options.chain)}`,
    affiliateKey && `affiliateKey: ${yamlString(affiliateKey)}`,
  ].filter(Boolean);

  const content = `---
title: ${yamlString(title)}
description: ${yamlString(description)}
publishedAt: ${yamlString(timestamp)}
updatedAt: ${yamlString(timestamp)}
lastVerifiedAt: ${yamlString(timestamp)}
author: "onefly"
category: ${yamlString(category)}
tags: ${yamlList(options.tags)}
cover: ${yamlString(cover)}
coverAlt: ${yamlString(coverAlt)}
featured: false
status: ${yamlString(status)}
${optionalFields.length ? `${optionalFields.join("\n")}\n` : ""}regions: ${yamlList(options.regions)}
riskDisclosure: "本文仅提供活动与产品信息，不构成投资建议；参与前请核验官方规则、地区限制与风险。"
editorialQa:
  - question: "TODO：读者最常搜索的具体问题是什么？"
    answer: "TODO：给出可核验的直接答案，并说明适用范围或时间边界。"
  - question: "TODO：读者最容易误解或需要继续确认什么？"
    answer: "TODO：澄清限制、风险和应当查阅的一手来源。"
sources: []
sidebar: false
tableOfContents:
  minHeadingLevel: 2
  maxHeadingLevel: 3
draft: true
noindex: true
---

<!--
Agent 写作约束：
- 开头直接回答读者最关心的问题，不写空泛背景。
- 给出明确的适用对象、地区、开始/结束时间、费用和参与步骤。
- 可核验事实加入 sources；不确定或可能变化的信息要标明核验日期。
- editorialQa 填写 2 至 4 组真实搜索问题，由编辑署名回答；不得伪造昵称、设备、IP、所在地或游客留言。
- 正文不要粘贴邀请链接。返佣入口只通过 affiliateKey 和站点返佣组件输出。
- 发布前补齐本地封面，将 draft/noindex 调整为合适值，并运行 npm run check:content。
-->

## 结论

TODO：用 2 至 4 句话给出结论、适用对象和当前状态。

## 关键条件

- 参与对象：TODO
- 活动或规则时间：TODO
- 费用与奖励：TODO
- 地区限制：TODO

## 操作步骤

1. TODO
2. TODO
3. TODO

## 风险与核验

TODO：说明资产、合约、托管、地区合规和活动变更风险，并指出最后核验时间。
`;

  await mkdir(blogRoot, { recursive: true });
  await writeFile(target, content, { encoding: "utf8", flag: "wx" });

  console.log(`已创建 src/content/blog/${slug}.md`);
  console.log(`下一步：添加 ${cover}，补充 editorialQa、sources 和正文，然后运行 npm run check:content。`);
}

main().catch((error) => {
  console.error(`创建文章失败：${error.message}`);
  process.exitCode = 1;
});

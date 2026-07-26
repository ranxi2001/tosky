#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  fetchOkxActivities,
  OKX_ACTIVITY_SOURCE_URL,
  syncOkxActivityArticles,
} from "./lib/okx-activity-sync.mjs";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const blogRoot = path.join(projectRoot, "src/content/blog");
const statePath = path.join(projectRoot, "src/data/okx-activity-sync.json");

const usage = `用法：
  npm run sync:okx -- [--pages 3] [--max-new 1] [--dry-run] [--report <path>]

选项：
  --pages <数量>       抓取 latest-events 的页数，范围 1-10，默认 3
  --max-new <数量>     单次最多创建的可收录活动文章，范围 0-20，默认 1
  --dry-run            只计算差异，不写入文件
  --report <路径>      将机器可读的同步结果写入 JSON 文件
  --help               显示帮助`;

function parseInteger(value, name, minimum, maximum) {
  if (!/^\d+$/u.test(value ?? "")) throw new Error(`${name} 必须是整数`);
  const parsed = Number(value);
  if (parsed < minimum || parsed > maximum) {
    throw new Error(`${name} 必须在 ${minimum}-${maximum} 之间`);
  }
  return parsed;
}

function parseArguments(argv) {
  const options = { pages: 3, maxNew: 1, dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help") options.help = true;
    else if (argument === "--dry-run") options.dryRun = true;
    else if (["--pages", "--max-new", "--report"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} 缺少值`);
      if (argument === "--pages") options.pages = parseInteger(value, argument, 1, 10);
      if (argument === "--max-new") options.maxNew = parseInteger(value, argument, 0, 20);
      if (argument === "--report") options.report = path.resolve(value);
      index += 1;
    } else {
      throw new Error(`无法识别参数：${argument}`);
    }
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(usage);
    return;
  }

  const activities = await fetchOkxActivities({ maxPages: options.pages });
  const report = await syncOkxActivityArticles({
    activities,
    blogRoot,
    statePath,
    maxNew: options.maxNew,
    sourceUrl: OKX_ACTIVITY_SOURCE_URL,
    write: !options.dryRun,
  });
  if (options.report) await writeFile(options.report, `${JSON.stringify(report, null, 2)}\n`);

  console.log(
    [
      `OKX 活动同步完成：抓取 ${report.fetched} 条`,
      `新发现 ${report.discovered} 条`,
      `官方元数据更新 ${report.updated} 条`,
      `${options.dryRun ? "将创建" : "已创建"}可收录文章 ${report.articlesCreated} 篇`,
      `队列待处理 ${report.pending} 条`,
    ].join("，"),
  );
  for (const slug of report.articleSlugs) console.log(`- src/content/blog/${slug}.md`);
}

main().catch((error) => {
  console.error(`OKX 活动同步失败：${error.message}`);
  process.exitCode = 1;
});

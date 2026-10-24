#!/usr/bin/env node

import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { syncReferral } from "./lib/okx-referral-sync.mjs";

const referralsPath = fileURLToPath(new URL("../src/data/referrals.json", import.meta.url));

async function main() {
  const options = { referralsPath, dryRun: true };
  let reportPath;
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (argument === "--dry-run") options.dryRun = true;
    else if (argument === "--write") options.dryRun = false;
    else if (argument === "--report") {
      const value = process.argv[++index];
      if (!value || value.startsWith("--")) throw new Error("--report 缺少路径");
      reportPath = path.resolve(value);
      if (reportPath === referralsPath) throw new Error("报告不能覆盖返佣配置");
    } else if (argument === "--help") {
      console.log("npm run sync:okx-referral -- [--dry-run|--write] [--report <path>]\n默认 dry-run；只读取公开 Notion，不访问注册页，不操作 Git 或 Cloudflare。");
      return;
    } else throw new Error(`无法识别参数：${argument}`);
  }
  const report = await syncReferral(options);
  if (reportPath) await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify({ dryRun: report.dryRun, changed: report.changed, previousUrl: report.previousUrl, url: report.url, evidence: report.evidence }, null, 2));
}

main().catch((error) => {
  console.error(`OKX 注册链接同步失败（保留旧值）：${error.message}`);
  process.exitCode = 1;
});

#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { publishReferral } from "./lib/okx-referral-publish.mjs";

try {
  const options = { cwd: fileURLToPath(new URL("..", import.meta.url)), push: false };
  let reportPath;
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index];
    if (argument === "--push") options.push = true;
    else if (["--base", "--report"].includes(argument)) {
      const value = process.argv[++index];
      if (!value || value.startsWith("--")) throw new Error(`${argument} 缺少值`);
      if (argument === "--base") options.baseSha = value;
      else reportPath = value;
    } else throw new Error(`无法识别参数：${argument}`);
  }
  if (!reportPath) throw new Error("缺少 --report 渲染证据");
  options.report = JSON.parse(readFileSync(reportPath, "utf8"));
  console.log(JSON.stringify(publishReferral(options)));
} catch (error) {
  console.error(`注册链接发布失败：${error.message}`);
  process.exitCode = 1;
}

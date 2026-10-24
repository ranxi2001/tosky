import { execFileSync } from "node:child_process";
import { lstatSync, readFileSync } from "node:fs";
import path from "node:path";
import { assertNotionSource, extractReferral, NOTION_PAGE_ID } from "./okx-referral-sync.mjs";

const referralsFile = "src/data/referrals.json";

function git(cwd, args, failure = "Git 操作失败，未授权覆盖 main", raw = false) {
  try {
    const output = execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return raw ? output : output.trim();
  } catch {
    // Never echo transport errors, remote URLs, credentials or child-process options.
    throw new Error(failure);
  }
}

export function publishReferral({ cwd, baseSha, report, push = false, beforePush } = {}) {
  if (!/^[a-f0-9]{40}$/u.test(baseSha ?? "")) throw new Error("缺少校验起点 main SHA");
  if (git(cwd, ["rev-parse", "HEAD"]) !== baseSha) throw new Error("本地 HEAD 已变化，必须重新校验");
  assertNotionSource(report.snapshot.sourceUrl);
  assertNotionSource(report.snapshot.finalUrl);
  if (report.snapshot.pageId !== NOTION_PAGE_ID || report.snapshot.httpStatus !== 200) {
    throw new Error("缺少成功的固定 Notion 页面渲染证据");
  }
  const { url } = extractReferral(report.snapshot);
  if (report.url !== url) throw new Error("报告 URL 与渲染正文不一致");
  const status = git(cwd, ["status", "--porcelain=v1", "--untracked-files=all", "-z"], undefined, true);
  for (const entry of status.split("\0").filter(Boolean)) {
    if (!/^[ MARCUD?!]{2} src\/data\/referrals\.json$/u.test(entry)) {
      throw new Error("拒绝未授权路径变更；仅允许 src/data/referrals.json");
    }
  }
  const original = git(cwd, ["show", `${baseSha}:${referralsFile}`], undefined, true);
  const data = JSON.parse(original);
  const fileStat = lstatSync(path.join(cwd, referralsFile));
  if (!fileStat.isFile() || (fileStat.mode & 0o111) !== 0) throw new Error("拒绝配置文件类型或权限变化");
  const currentText = readFileSync(path.join(cwd, referralsFile), "utf8");
  const expected = structuredClone(data);
  expected.okx.url = url;
  const expectedText = original.replace(
    /("okx"\s*:\s*\{[^{}]*?"url"\s*:\s*)("(?:[^"\\]|\\.)*")/u,
    (_match, prefix) => `${prefix}${JSON.stringify(url)}`,
  );
  if (JSON.stringify(JSON.parse(currentText)) !== JSON.stringify(expected) || currentText !== expectedText) {
    throw new Error("拒绝 okx.url 以外的配置或格式变化");
  }
  const changed = data.okx.url !== url;
  if (!changed || !push) return { changed, pushed: false, baseSha, url };

  git(cwd, ["fetch", "--no-tags", "origin", "refs/heads/main"], "读取远端 main 失败，未提交或推送");
  if (git(cwd, ["rev-parse", "FETCH_HEAD"]) !== baseSha) {
    throw new Error("远端 main 已变化；请重新运行完整同步与校验，未提交或推送");
  }
  git(cwd, ["add", "--", referralsFile]);
  if (git(cwd, ["diff", "--cached", "--name-only"]) !== referralsFile) {
    throw new Error("暂存区不符合最小路径白名单，拒绝提交");
  }
  git(cwd, ["commit", "-m", "fix: sync OKX registration domain from rendered Notion"]);
  const commit = git(cwd, ["rev-parse", "HEAD"]);
  if (git(cwd, ["rev-parse", "HEAD^"]) !== baseSha ||
      git(cwd, ["diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"]) !== referralsFile ||
      git(cwd, ["show", `HEAD:${referralsFile}`], undefined, true) !== expectedText) {
    throw new Error("提交不符合校验起点或最小路径白名单，拒绝推送");
  }
  beforePush?.(); // Tests use an independent clone to reproduce a real concurrent push.
  git(cwd, ["push", "--porcelain", "origin", "HEAD:refs/heads/main"], "main 并发推进或远端规则拒绝：非 force push 失败，请重新运行；不会覆盖远端");
  return { changed, pushed: true, baseSha, commit, url };
}

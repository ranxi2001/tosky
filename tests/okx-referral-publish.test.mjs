import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmod, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { publishReferral } from "../scripts/lib/okx-referral-publish.mjs";
import { NOTION_PAGE_ID, NOTION_SOURCE_URL } from "../scripts/lib/okx-referral-sync.mjs";

const file = "src/data/referrals.json";
const candidate = "https://www.current-example.com/join/88596413";
const template = await readFile(new URL("../src/data/referrals.json", import.meta.url), "utf8");
const report = {
  url: candidate,
  snapshot: {
    sourceUrl: NOTION_SOURCE_URL, finalUrl: NOTION_SOURCE_URL, pageId: NOTION_PAGE_ID,
    httpStatus: 200, text: `最新官方域名：\n短链域名 join页：${candidate}`, links: [],
  },
};
const git = (cwd, ...args) => execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();

async function fixture(t, initialUrl = "https://www.old-example.com/join/88596413") {
  const root = await mkdtemp(path.join(os.tmpdir(), "tosky-direct-push-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const remote = path.join(root, "origin.git");
  const cwd = path.join(root, "work");
  const competitor = path.join(root, "competitor");
  git(root, "init", "--bare", "--initial-branch=main", remote);
  git(root, "init", "--initial-branch=main", cwd);
  git(cwd, "config", "user.name", "Sync fixture");
  git(cwd, "config", "user.email", "fixture@example.invalid");
  git(cwd, "remote", "add", "origin", remote);
  await mkdir(path.join(cwd, "src/data"), { recursive: true });
  const original = template.replace(JSON.parse(template).okx.url, initialUrl);
  await writeFile(path.join(cwd, file), original);
  await writeFile(path.join(cwd, "keep.txt"), "baseline\n");
  git(cwd, "add", ".");
  git(cwd, "commit", "-m", "baseline");
  git(cwd, "push", "origin", "HEAD:refs/heads/main"); // Only a temporary local bare repository.
  const baseSha = git(cwd, "rev-parse", "HEAD");
  git(root, "clone", "--quiet", remote, competitor);
  git(competitor, "config", "user.name", "Independent writer");
  git(competitor, "config", "user.email", "writer@example.invalid");
  await writeFile(path.join(cwd, file), original.replace(initialUrl, candidate));
  const compete = () => {
    execFileSync("node", ["-e", "require('fs').writeFileSync('keep.txt','concurrent writer\\n')"], { cwd: competitor });
    git(competitor, "add", "keep.txt");
    git(competitor, "commit", "-m", "independent change");
    git(competitor, "push", "origin", "HEAD:refs/heads/main");
    return git(competitor, "rev-parse", "HEAD");
  };
  return { cwd, remote, competitor, original, baseSha, report, compete };
}

test("白名单通过后仅 fast-forward main；唯一提交仅含 okx.url，不创建额外分支", async (t) => {
  const context = await fixture(t);
  const result = publishReferral({ ...context, push: true });
  assert.equal(result.pushed, true);
  assert.equal(git(context.remote, "rev-parse", "refs/heads/main"), result.commit);
  assert.equal(git(context.remote, "rev-parse", `${result.commit}^`), context.baseSha);
  assert.equal(git(context.remote, "diff", "--name-only", context.baseSha, result.commit), file);
  const data = JSON.parse(context.original);
  data.okx.url = candidate;
  assert.deepEqual(JSON.parse(git(context.remote, "show", `main:${file}`)), data);
  assert.equal(git(context.remote, "for-each-ref", "--format=%(refname)", "refs/heads"), "refs/heads/main");
});

test("默认仅预检，不提交、不访问远端；相同 URL 即使 --push 也完全无操作", async (t) => {
  for (const initialUrl of ["https://www.old-example.com/join/88596413", candidate]) {
    const context = await fixture(t, initialUrl);
    git(context.cwd, "remote", "remove", "origin");
    const result = publishReferral({ ...context, push: initialUrl === candidate });
    assert.equal(result.changed, initialUrl !== candidate);
    assert.equal(result.pushed, false);
    assert.equal(git(context.cwd, "rev-parse", "HEAD"), context.baseSha);
  }
});

test("拒绝未授权 tracked/staged/untracked diff；保持远端 main 原值", async (t) => {
  for (const kind of ["tracked", "staged", "untracked"]) {
    const context = await fixture(t);
    const otherFile = kind === "untracked" ? "unexpected.txt" : "keep.txt";
    await writeFile(path.join(context.cwd, otherFile), "unrelated\n");
    if (kind === "staged") git(context.cwd, "add", otherFile);
    assert.throws(() => publishReferral({ ...context, push: true }), /未授权路径/u);
    assert.equal(git(context.remote, "rev-parse", "main"), context.baseSha);
    assert.equal(git(context.cwd, "rev-parse", "HEAD"), context.baseSha);
  }
});

test("拒绝同文件的其他配置/格式差异或不匹配的渲染证据", async (t) => {
  const context = await fixture(t);
  const expected = context.original.replace(JSON.parse(context.original).okx.url, candidate);
  for (const text of [expected.replace("20%", "30%"), `${expected}\n`]) {
    await writeFile(path.join(context.cwd, file), text);
    assert.throws(() => publishReferral({ ...context, push: true }), /okx.url 以外/u);
  }
  await writeFile(path.join(context.cwd, file), expected);
  await chmod(path.join(context.cwd, file), 0o755);
  assert.throws(() => publishReferral({ ...context, push: true }), /权限变化/u);
  await chmod(path.join(context.cwd, file), 0o644);
  assert.throws(() => publishReferral({ ...context, report: { ...report, url: "https://wrong.com/join/88596413" }, push: true }), /不一致/u);
  assert.equal(git(context.remote, "rev-parse", "main"), context.baseSha);
});

test("校验后 main 已推进：明确失败，既不重放旧构建也不提交或覆盖", async (t) => {
  const context = await fixture(t);
  const competingSha = context.compete();
  assert.throws(() => publishReferral({ ...context, push: true }), /远端 main 已变化/u);
  assert.equal(git(context.cwd, "rev-parse", "HEAD"), context.baseSha);
  assert.equal(git(context.remote, "rev-parse", "main"), competingSha);
  assert.equal(git(context.remote, "show", "main:keep.txt"), "concurrent writer");
});

test("fetch 后、push 前发生竞态：普通 push 被拒，保留独立写入且不 force", async (t) => {
  const context = await fixture(t);
  let competingSha;
  assert.throws(() => publishReferral({ ...context, push: true, beforePush: () => { competingSha = context.compete(); } }), /非 force push 失败/u);
  assert.equal(git(context.remote, "rev-parse", "main"), competingSha);
  assert.equal(git(context.remote, "show", "main:keep.txt"), "concurrent writer");
  assert.deepEqual(JSON.parse(git(context.remote, "show", `main:${file}`)), JSON.parse(context.original));
});

test("远端拒绝规则明确失败，不能静默宣称发布成功", async (t) => {
  const context = await fixture(t);
  await writeFile(path.join(context.remote, "hooks/update"), "#!/bin/sh\nexit 1\n", { mode: 0o755 });
  assert.throws(() => publishReferral({ ...context, push: true }), /远端规则拒绝/u);
  assert.equal(git(context.remote, "rev-parse", "main"), context.baseSha);
});

test("workflow 只申请 Contents write；dry-run 不取 token；App push 接入既有部署，无分支/PR/force", async () => {
  const workflow = await readFile(new URL("../.github/workflows/sync-okx-referral.yml", import.meta.url), "utf8");
  const deploy = await readFile(new URL("../.github/workflows/deploy.yml", import.meta.url), "utf8");
  const publisher = await readFile(new URL("../scripts/lib/okx-referral-publish.mjs", import.meta.url), "utf8");
  assert.match(workflow, /default: true/u);
  assert.match(workflow, /permissions:\n  contents: read\n/u);
  assert.match(workflow, /permission-contents: write/u);
  assert.doesNotMatch(workflow, /pull-requests|permission-actions|gh pr|automation\/|git switch|git branch|--force/u);
  assert.equal((workflow.match(/inputs\.dry_run != true/gu) ?? []).length, 2);
  assert.match(workflow, /GH_TOKEN: \$\{\{ steps\.app-token\.outputs\.token \}\}/u);
  assert.match(workflow, /persist-credentials: false/u);
  assert.match(workflow, /gh auth setup-git/u);
  assert.ok(workflow.indexOf("run: npm run check") < workflow.indexOf("id: changes"));
  assert.ok(workflow.indexOf("id: changes") < workflow.indexOf("id: app-token"));
  assert.match(publisher, /\["push", "--porcelain", "origin", "HEAD:refs\/heads\/main"\]/u);
  assert.match(deploy, /push:\n    branches: \[main\]/u);
  assert.match(deploy, /needs: validate/u);
});

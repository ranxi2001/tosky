import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test, { after, before } from "node:test";
import { chromium } from "playwright";
import {
  assertNotionSource,
  extractReferral,
  NOTION_PAGE_ID,
  NOTION_SOURCE_URL,
  renderNotion,
  syncReferral,
} from "../scripts/lib/okx-referral-sync.mjs";

const current = "https://www.current-example.com/join/88596413";
const original = await readFile(new URL("../src/data/referrals.json", import.meta.url), "utf8");
const snapshot = (section) => ({ text: `最新官方域名：\n${section}`, links: [], pageText: "" });
let browser;
before(async () => { browser = await chromium.launch({ headless: true }); });
after(async () => { await browser?.close(); });

function mockedBrowser(html, status = 200) {
  return {
    version: () => browser.version(),
    async newContext(options) {
      const context = await browser.newContext(options);
      await context.route("**/*", (route) => route.fulfill({ status, contentType: "text/html; charset=utf-8", body: html }));
      return context;
    },
  };
}

function dynamicPage(text, { delay = 150, later = "", laterDelay = 400 } = {}) {
  return `<div class="notion-page-block" data-block-id="${NOTION_PAGE_ID}"></div><div class="notion-page-content" style="white-space:pre-wrap"></div>
    <script>const unrelated = "https://www.script-only.com/join/99999999";
    setTimeout(() => document.querySelector('.notion-page-content').textContent = ${JSON.stringify(text)}, ${delay});
    ${later ? `setTimeout(() => document.querySelector('.notion-page-content').textContent += ${JSON.stringify(later)}, ${laterDelay});` : ""}</script>`;
}

test("页面 ID 是身份，接受旧 slug 与 https slug，拒绝其他页/host/scheme", () => {
  assert.equal(assertNotionSource(NOTION_SOURCE_URL), NOTION_SOURCE_URL);
  const old = NOTION_SOURCE_URL.replace("APK-https-www-mitxcqvwnhj-com-join", "APK-www-stale-domain-com-join");
  assert.equal(assertNotionSource(old), old);
  for (const url of [NOTION_SOURCE_URL.replace(NOTION_PAGE_ID, "0".repeat(32)), NOTION_SOURCE_URL.replace("https:", "http:"), NOTION_SOURCE_URL.replace(".notion.site", ".evil.com"), `${NOTION_SOURCE_URL}?other=1`]) {
    assert.throws(() => assertNotionSource(url));
  }
});

test("仅解析最新官方域名的 join 语义，忽略验证/APK/历史域名及标题", () => {
  const result = extractReferral({
    title: "https://www.stale.com/join/88596413",
    text: "验证网址https://www.okx.com/zh-hans/support-center/channel-verification\n最新官方域名：\n短链域名 join页：https://www.current-example.com/join/渠道号\nAPK短链域名：https://www.apk-domain.com/upgradeapp/android_邀请码.apk\n历史域名：https://www.stale.com/join/88596413",
    links: [{ href: "https://www.okx.com/join/88596413", line: "最新官方域名：" }],
  });
  assert.equal(result.url, current);
});

test("读取最新域名段内的可见 anchor href；重复同一候选不视为歧义", () => {
  const result = extractReferral({ ...snapshot("join页：点击注册"), links: [{ line: "join页：点击注册", href: current }, { line: "join页：点击注册", href: current }] });
  assert.equal(result.url, current);
});

test("空、无语义、仅官方验证、歧义与 blocked 均失败", () => {
  for (const value of [
    { text: "" },
    { text: current },
    snapshot("https://www.okx.com/join/88596413"),
    snapshot(`${current}\nhttps://www.another-example.com/join/渠道号`),
    { ...snapshot(current), pageText: "Access denied" },
    snapshot("https://www.apk-example.com/upgradeapp/android_邀请码.apk"),
  ]) assert.throws(() => extractReferral(value));
});

test("严格拒绝不安全 hostname/path、错误邀请码及查询参数", () => {
  for (const url of [
    "http://www.current-example.com/join/88596413",
    "https://user:password@www.current-example.com/join/88596413",
    "https://www.current-example.com:443/join/88596413",
    "https://127.0.0.1/join/88596413",
    "https://www.current-example.com.evil.com/join/88596413",
    "https://xn--test.com/join/88596413",
    "https://www.current-example.com/join/12345678",
    "https://www.current-example.com/join/88596413/extra",
    "https://www.current-example.com/join/88596413?ref=wrong",
    "https://www.current-example.com/join/88596413#other",
    "https://www.current-example.com/join/%2e%2e/other",
  ]) assert.throws(() => extractReferral(snapshot(url)), url);
});

test("dry-run、失败和相同 URL 不写入；写入仅改变 okx.url，邀请码/20%/其他配置字节不动", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "tosky-referral-"));
  const referralsPath = path.join(temporaryRoot, "referrals.json");
  try {
    await writeFile(referralsPath, original);
    const render = async () => snapshot(current);
    await syncReferral({ referralsPath, render });
    assert.equal(await readFile(referralsPath, "utf8"), original);
    for (const renderFailure of [async () => { throw new Error("timeout"); }, async () => snapshot(`${current}\nhttps://www.ambiguous.com/join/渠道号`), async () => snapshot("https://www.current-example.com/join/99999999")]) {
      await assert.rejects(syncReferral({ referralsPath, dryRun: false, render: renderFailure }));
      assert.equal(await readFile(referralsPath, "utf8"), original);
    }
    const result = await syncReferral({ referralsPath, dryRun: false, render });
    const expected = original.replace(JSON.parse(original).okx.url, current);
    assert.equal(result.changed, true);
    assert.equal(await readFile(referralsPath, "utf8"), expected);
    assert.equal((await syncReferral({ referralsPath, dryRun: false, render })).changed, false);
    assert.equal(await readFile(referralsPath, "utf8"), expected);
    for (const altered of [expected.replace('"inviteCode": "88596413"', '"inviteCode": "bad"'), expected.replace("20%", "30%")]) {
      await writeFile(referralsPath, altered);
      await assert.rejects(syncReferral({ referralsPath, dryRun: false, render }), /已验证标准/u);
      assert.equal(await readFile(referralsPath, "utf8"), altered);
    }
  } finally { await rm(temporaryRoot, { recursive: true, force: true }); }
});

test("Chromium 真正执行异步 JS；旧 slug 不变、正文更新仍能取新域名", async () => {
  const html = dynamicPage("最新官方域名：\n短链域名 join页：https://www.current-example.com/join/渠道号");
  const result = await renderNotion({
    browser: mockedBrowser(html),
    sourceUrl: NOTION_SOURCE_URL.replace("APK-https-www-mitxcqvwnhj-com-join", "APK-www-stale-com-join"),
    stableMs: 500,
    timeoutMs: 4000,
  });
  assert.equal(extractReferral(result).url, current);
  assert.match(result.browser, /^Chromium /u);
  assert.ok(result.elapsedMs >= 500);
});

test("动态渲染可见链接，隐藏节点/脚本/页面标题不能成为候选，且绝不访问注册链接", async () => {
  let externalRequests = 0;
  const mocked = mockedBrowser(`<title>最新官方域名：https://www.stale.com/join/88596413</title>
    <div class="notion-page-block" data-block-id="${NOTION_PAGE_ID}"><div class="notion-page-content">
    <div data-block-id="section">最新官方域名：</div><div data-block-id="link">join页：<a href="${current}">点击注册</a></div>
    <div style="display:none">https://www.hidden.com/join/88596413</div>
    <a style="display:none" href="https://www.hidden.com/join/88596413">hidden</a></div></div>
    <script>fetch('${current}');</script>`);
  const newContext = mocked.newContext;
  mocked.newContext = async (options) => {
    const context = await newContext(options);
    await context.route("https://www.current-example.com/**", (route) => { externalRequests += 1; return route.abort(); });
    return context;
  };
  const result = await renderNotion({ browser: mocked, stableMs: 300, timeoutMs: 3000 });
  assert.equal(extractReferral(result).url, current);
  assert.equal(externalRequests, 0);
});

test("等待后续正文稳定，晚到的第二候选触发歧义失败", async () => {
  await assert.rejects(renderNotion({
    browser: mockedBrowser(dynamicPage(`最新官方域名：\n${current}`, { later: "\nhttps://www.another-example.com/join/渠道号" })),
    stableMs: 600,
    timeoutMs: 4000,
  }), /必须唯一/u);
});

test("页面仍标记加载时不采用已有候选，直到动态正文真正完成", async () => {
  const html = `<div class="notion-page-block" data-block-id="${NOTION_PAGE_ID}"></div>
    <div class="notion-page-content" aria-busy="true" style="white-space:pre-wrap">最新官方域名：\nhttps://www.stale.com/join/渠道号</div>
    <script>setTimeout(() => {
      const content = document.querySelector('.notion-page-content');
      content.textContent = ${JSON.stringify(`最新官方域名：\n${current}`)};
      content.removeAttribute('aria-busy');
    }, 500);</script>`;
  const result = await renderNotion({ browser: mockedBrowser(html), stableMs: 100, timeoutMs: 3000 });
  assert.equal(extractReferral(result).url, current);
});

test("浏览器遇到 HTTP 失败、空壳超时、拦截页面和错误页面 ID 都失败", async () => {
  for (const [html, status, pattern] of [
    ["unavailable", 503, /HTTP 503/u],
    ["Too many requests", 429, /HTTP 429/u],
    ["Access denied", 200, /拦截/u],
    ["<div>Loading...</div>", 200, /超时/u],
    [dynamicPage(`最新官方域名：\n${current}`).replace(NOTION_PAGE_ID, "0".repeat(32)), 200, /超时/u],
  ]) await assert.rejects(renderNotion({ browser: mockedBrowser(html, status), stableMs: 100, timeoutMs: 700 }), pattern);
});

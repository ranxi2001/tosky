import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

export const NOTION_PAGE_ID = "df0b826aa4b840fea1aa4f351529afd1";
export const NOTION_SOURCE_URL = "https://conscious-meerkat-b7e.notion.site/APK-https-www-mitxcqvwnhj-com-join-df0b826aa4b840fea1aa4f351529afd1";
const notionHost = new URL(NOTION_SOURCE_URL).hostname;
const latestMarker = /最新官方域名\s*[:：]|latest official domain\s*:/iu;
const sectionBoundary = /APK|历史域名|旧域名|苹果用户|官方渠道验证/iu;
const blockedMessage = /access denied|request blocked|verify you are human|just a moment|this page is private|page not found|you do not have access|没有访问权限|无法访问此页面|页面不存在|验证码/iu;

export function assertNotionSource(sourceUrl) {
  const url = new URL(sourceUrl);
  const id = url.pathname.match(/(?:^|[-/])([a-f0-9]{32})$/iu)?.[1];
  if (url.protocol !== "https:" || url.hostname !== notionHost || url.username || url.password ||
      url.port || url.search || url.hash || id?.toLowerCase() !== NOTION_PAGE_ID) {
    throw new Error("来源必须是固定 Notion 页面 ID；slug 不参与域名解析");
  }
  return url.href;
}

function referralUrl(rawUrl) {
  // Narrow by design: this source publishes rotating .com hosts and /join paths.
  // Never visit the candidate, resolve redirects, or infer it from the page title.
  if (!/^https:\/\/(?:www\.)?[a-z0-9-]+\.com\//iu.test(rawUrl)) {
    throw new Error("候选链接必须使用 HTTPS 和安全的 .com hostname");
  }
  const url = new URL(rawUrl);
  if (!/^(?:www\.)?[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.com$/u.test(url.hostname) ||
      url.hostname.includes("xn--") || url.username || url.password || url.port || url.search || url.hash) {
    throw new Error("候选 hostname、凭据、端口或参数不安全");
  }
  if (/^(?:www\.)?(?:okx|binance|notion)\.com$/u.test(url.hostname)) return null;
  const pathname = decodeURIComponent(url.pathname);
  if (!/^\/join(?:\/(?:88596413|渠道号|邀请码))?\/?$/u.test(pathname)) {
    throw new Error("候选必须是 /join，且邀请码只能为 88596413 或来源占位符");
  }
  return `${url.origin}/join/88596413`;
}

export function extractReferral(snapshot) {
  if (blockedMessage.test(snapshot.pageText ?? "")) throw new Error("Notion 页面被拦截或不可公开访问");
  if (!snapshot.text?.trim()) throw new Error("Notion 正文为空");
  const candidates = new Map();
  const evidence = [];
  let inLatestSection = false;
  for (const line of snapshot.text.split(/\r?\n/u).map((value) => value.trim()).filter(Boolean)) {
    if (latestMarker.test(line)) inLatestSection = true;
    else if (sectionBoundary.test(line)) inLatestSection = false;
    if (!inLatestSection) continue;

    const links = (snapshot.links ?? []).filter((link) => link.line === line);
    const urls = [...line.matchAll(/(?:https?:\/\/|www\.)[^\s<>"'，。；、）)]+/giu)].map((match) => match[0]);
    urls.push(...links.map((link) => link.href));
    for (const rawUrl of urls) {
      // Verification, APK and static-resource links cannot become registrations.
      if (!/\/join(?:\/|$|[?#])/iu.test(rawUrl)) continue;
      const candidate = referralUrl(rawUrl);
      if (!candidate) continue;
      candidates.set(candidate, true);
      evidence.push({ text: line, sourceLink: rawUrl });
    }
  }
  if (candidates.size !== 1) {
    throw new Error(`最新官方域名 /join 候选必须唯一，实际 ${candidates.size} 个`);
  }
  return { url: [...candidates.keys()][0], evidence };
}

async function readRenderedSnapshot(page) {
  return page.evaluate((pageId) => {
    const pageRoot = [...document.querySelectorAll(".notion-page-block[data-block-id]")]
      .find((element) => element.getAttribute("data-block-id").replaceAll("-", "") === pageId);
    const visible = (element) => {
      const style = getComputedStyle(element);
      return style.visibility !== "hidden" && style.display !== "none" && element.getClientRects().length > 0;
    };
    // Public Notion renders the ID-bearing title block and body as siblings.
    // Require both the pinned ID and exactly one visible body, without a generic body fallback.
    const contents = [...document.querySelectorAll(".notion-page-content")].filter(visible);
    const content = pageRoot && contents.length === 1 ? contents[0] : null;
    if (!content || !visible(content)) return { text: "", links: [], pageText: document.body.innerText };
    // innerText reads rendered text; scripts and hidden links are never candidates.
    const links = [...content.querySelectorAll("a[href]")].filter(visible).map((anchor) => {
      const block = anchor.closest("[data-block-id]");
      return { href: anchor.href, text: anchor.innerText, line: (block ?? anchor).innerText.trim() };
    });
    return { text: content.innerText, links, pageText: document.body.innerText };
  }, NOTION_PAGE_ID);
}

export async function renderNotion({ sourceUrl = NOTION_SOURCE_URL, browser, timeoutMs = 45000, stableMs = 2500 } = {}) {
  assertNotionSource(sourceUrl);
  const ownBrowser = !browser;
  browser ??= await chromium.launch({ headless: true });
  const started = Date.now();
  let context;
  try {
    context = await browser.newContext({ locale: "zh-CN", serviceWorkers: "block", acceptDownloads: false });
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      const notionResource = ["notion.site", "notion.so", "notion-static.com", "notionusercontent.com"]
        .some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
      if (!notionResource || url.protocol !== "https:") return route.abort();
      if (request.isNavigationRequest()) {
        try { assertNotionSource(url.href); } catch { return route.abort(); }
      }
      return route.fallback();
    });
    const page = await context.newPage();
    const response = await page.goto(sourceUrl, { waitUntil: "domcontentloaded", timeout: timeoutMs });
    if (!response?.ok()) throw new Error(`Notion HTTP ${response?.status() ?? "无响应"}`);
    let previous = "";
    let stableSince = Date.now();
    while (Date.now() - started < timeoutMs) {
      assertNotionSource(page.url());
      const snapshot = await readRenderedSnapshot(page);
      if (blockedMessage.test(snapshot.pageText)) throw new Error("Notion 页面被拦截或不可公开访问");
      const signature = JSON.stringify({ text: snapshot.text, links: snapshot.links });
      if (signature !== previous) { previous = signature; stableSince = Date.now(); }
      const loading = await page.locator('.notion-page-content[aria-busy="true"], .notion-page-content [aria-busy="true"], .notion-page-content [role="progressbar"]').count();
      if (latestMarker.test(snapshot.text) && !loading && Date.now() - stableSince >= stableMs) {
        // Validate the complete stable section; ambiguity is an error, never first-match wins.
        extractReferral(snapshot);
        return {
          ...snapshot,
          sourceUrl,
          finalUrl: page.url(),
          pageId: NOTION_PAGE_ID,
          httpStatus: response.status(),
          browser: `Chromium ${browser.version()}`,
          renderedAt: new Date().toISOString(),
          elapsedMs: Date.now() - started,
          contentSha256: createHash("sha256").update(snapshot.text).digest("hex"),
        };
      }
      await page.waitForTimeout(200);
    }
    throw new Error("等待 Notion 动态正文加载并稳定超时，保留旧值");
  } finally {
    await context?.close();
    if (ownBrowser) await browser.close();
  }
}

export async function syncReferral({ referralsPath, dryRun = true, render = renderNotion } = {}) {
  const original = await readFile(referralsPath, "utf8");
  const data = JSON.parse(original);
  if (data.okx?.inviteCode !== "88596413" || !data.okx.benefit?.includes("20%")) {
    throw new Error("OKX 邀请码 88596413 和 20% 已验证标准必须保留");
  }
  const snapshot = await render();
  const { url, evidence } = extractReferral(snapshot);
  const changed = data.okx.url !== url;
  if (changed && !dryRun) {
    // Replace just this JSON string token, preserving all unrelated bytes and formatting.
    const next = structuredClone(data);
    next.okx.url = url;
    const pattern = /("okx"\s*:\s*\{[^{}]*?"url"\s*:\s*)("(?:[^"\\]|\\.)*")/u;
    const updated = original.replace(pattern, (_match, prefix) => `${prefix}${JSON.stringify(url)}`);
    if (JSON.stringify(JSON.parse(updated)) !== JSON.stringify(next)) throw new Error("拒绝修改 okx.url 以外的配置");
    if (await readFile(referralsPath, "utf8") !== original) throw new Error("配置在抓取时发生变化，拒绝覆盖");
    await writeFile(referralsPath, updated);
  }
  return { dryRun, changed, previousUrl: data.okx.url, url, evidence, snapshot };
}

import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

export const OKX_ACTIVITY_SOURCE_URL =
  "https://www.okx.com/zh-hans/help/section/latest-events";
export const OKX_ACTIVITY_STATE_VERSION = 1;
export const OKX_ACTIVITY_COVER =
  "/images/posts/dac8b2a1-c1ed-446b-bbcf-80cba198ce4a.png";

const OKX_HOSTNAME = "www.okx.com";
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024;
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

function sha256(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}

function yamlString(value) {
  return JSON.stringify(String(value));
}

function normalizeTitle(value) {
  const title = decodeHtmlEntities(String(value)).replace(/\s+/gu, " ").trim();
  if (!title || [...title].length > 300 || /[\u0000-\u001f\u007f]/u.test(title)) {
    throw new Error("OKX 活动标题为空、过长或含控制字符");
  }
  return title;
}

function decodeHtmlEntities(value) {
  const named = new Map([
    ["amp", "&"],
    ["apos", "'"],
    ["gt", ">"],
    ["lt", "<"],
    ["quot", '"'],
  ]);

  return value.replace(/&(?:#(\d+)|#x([\da-f]+)|([a-z]+));/giu, (match, decimal, hex, name) => {
    if (decimal) return String.fromCodePoint(Number.parseInt(decimal, 10));
    if (hex) return String.fromCodePoint(Number.parseInt(hex, 16));
    return named.get(name.toLowerCase()) ?? match;
  });
}

function escapeMarkdown(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replace(/([\\`*_[\]{}()#+.!|\-])/gu, "\\$1");
}

function toIsoDate(value, label) {
  if (!Number.isFinite(value)) throw new Error(`${label} 不是有效时间戳`);
  const date = new Date(value);
  const year = date.getUTCFullYear();
  if (Number.isNaN(date.getTime()) || year < 2000 || year > 2100) {
    throw new Error(`${label} 超出可接受范围`);
  }
  return date.toISOString();
}

export function assertOfficialOkxUrl(value, expectedPath) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`不是有效 URL：${value}`);
  }

  if (
    url.protocol !== "https:" ||
    url.hostname.toLowerCase() !== OKX_HOSTNAME ||
    url.username ||
    url.password
  ) {
    throw new Error(`只允许访问 https://${OKX_HOSTNAME}：${value}`);
  }
  if (expectedPath && url.pathname.replace(/\/$/u, "") !== expectedPath) {
    throw new Error(`OKX 来源路径不符合预期：${url.pathname}`);
  }
  return url;
}

function normalizeOfficialItem(item) {
  if (!item || typeof item !== "object") throw new Error("OKX 活动记录不是对象");
  const id = String(item.id ?? "");
  const officialSlug = String(item.slug ?? "");
  const slugPattern = /^[a-z0-9](?:[a-z0-9-]{0,198}[a-z0-9])?$/u;
  if (!slugPattern.test(id) || !slugPattern.test(officialSlug)) {
    throw new Error(`OKX 活动 ID 或 slug 不合法：${id || officialSlug}`);
  }
  if (item.sectionSlug !== "latest-events") {
    throw new Error(`OKX 活动不属于 latest-events：${id}`);
  }

  const title = normalizeTitle(item.title);
  const publishedAt = toIsoDate(Number(item.publishTime), `${id}.publishTime`);
  const sourceUpdatedAt = toIsoDate(Number(item.updatedAt), `${id}.updatedAt`);
  const sourceUrl = new URL(`/zh-hans/help/${officialSlug}`, `https://${OKX_HOSTNAME}`).href;
  const normalized = { id, officialSlug, title, sourceUrl, publishedAt, sourceUpdatedAt };
  return { ...normalized, sourceHash: sha256(JSON.stringify(normalized)) };
}

export function parseOkxActivityPage(html) {
  if (typeof html !== "string" || Buffer.byteLength(html) > MAX_RESPONSE_BYTES) {
    throw new Error("OKX 响应为空或超过 5 MiB");
  }
  const match = html.match(
    /<script\b(?=[^>]*\bid=(?:"appState"|'appState'))[^>]*>([\s\S]*?)<\/script>/iu,
  );
  if (!match) throw new Error("OKX 页面缺少 appState 结构化数据");

  let appState;
  try {
    appState = JSON.parse(match[1]);
  } catch (error) {
    throw new Error(`OKX appState 不是有效 JSON：${error.message}`);
  }

  const articleList = appState?.appContext?.initialProps?.sectionData?.articleList;
  if (!articleList || !Array.isArray(articleList.list) || articleList.list.length === 0) {
    throw new Error("OKX latest-events 列表为空，已停止同步以避免误删或误判");
  }

  const pageNum = Number(articleList.pageNum);
  const pageSize = Number(articleList.pageSize);
  const total = Number(articleList.total);
  if (
    !Number.isInteger(pageNum) ||
    pageNum < 1 ||
    !Number.isInteger(pageSize) ||
    pageSize < 1 ||
    !Number.isInteger(total) ||
    total < articleList.list.length
  ) {
    throw new Error("OKX latest-events 分页元数据不合法");
  }

  return {
    pageNum,
    pageSize,
    total,
    items: articleList.list.map(normalizeOfficialItem),
  };
}

async function readResponseBody(response) {
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_RESPONSE_BYTES) {
    throw new Error("OKX 响应超过 5 MiB");
  }
  if (!response.body) throw new Error("OKX 响应没有正文");

  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_RESPONSE_BYTES) {
      await reader.cancel();
      throw new Error("OKX 响应超过 5 MiB");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

export async function fetchOfficialOkxPage(value, fetchImpl = fetch) {
  let url = assertOfficialOkxUrl(value);
  for (let redirect = 0; redirect <= 3; redirect += 1) {
    const response = await fetchImpl(url, {
      headers: {
        accept: "text/html,application/xhtml+xml",
        "accept-language": "zh-CN,zh;q=0.9,en;q=0.8",
        "user-agent": BROWSER_USER_AGENT,
      },
      redirect: "manual",
      signal: AbortSignal.timeout(15_000),
    });

    if (REDIRECT_STATUSES.has(response.status)) {
      const location = response.headers.get("location");
      if (!location) throw new Error(`OKX 返回 ${response.status} 但没有 Location`);
      url = assertOfficialOkxUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok) throw new Error(`OKX 请求失败：HTTP ${response.status}`);
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.toLowerCase().includes("text/html")) {
      throw new Error(`OKX 返回了非 HTML 内容：${contentType || "未知类型"}`);
    }
    return readResponseBody(response);
  }
  throw new Error("OKX 重定向次数超过限制");
}

export async function fetchOkxActivities({
  maxPages = 3,
  sourceUrl = OKX_ACTIVITY_SOURCE_URL,
  fetchPage = fetchOfficialOkxPage,
} = {}) {
  if (!Number.isInteger(maxPages) || maxPages < 1 || maxPages > 10) {
    throw new Error("maxPages 必须是 1 到 10 的整数");
  }
  const source = assertOfficialOkxUrl(sourceUrl, "/zh-hans/help/section/latest-events");
  source.search = "";
  source.hash = "";
  source.pathname = source.pathname.replace(/\/$/u, "");

  const first = parseOkxActivityPage(await fetchPage(source.href));
  if (first.pageNum !== 1) throw new Error("OKX 首页返回了错误的页码");
  const pageCount = Math.min(maxPages, Math.max(1, Math.ceil(first.total / first.pageSize)));
  const pages = [first];
  for (let page = 2; page <= pageCount; page += 1) {
    const pageUrl = new URL(`${source.pathname}/page/${page}`, source.origin).href;
    const result = parseOkxActivityPage(await fetchPage(pageUrl));
    if (result.pageNum !== page) throw new Error(`OKX 第 ${page} 页返回了错误的页码`);
    pages.push(result);
  }

  const byId = new Map();
  for (const item of pages.flatMap((page) => page.items)) {
    const previous = byId.get(item.id);
    if (previous && previous.sourceHash !== item.sourceHash) {
      throw new Error(`OKX 活动 ${item.id} 在分页结果中不一致`);
    }
    byId.set(item.id, item);
  }
  if (byId.size === 0) throw new Error("OKX 活动列表为空，已停止同步");
  return [...byId.values()].sort(compareItems);
}

function compareItems(a, b) {
  return b.publishedAt.localeCompare(a.publishedAt) || a.id.localeCompare(b.id);
}

export function isLikelyOkxActivity(item) {
  return /(?:空投|奖励|瓜分|活动|交易赛|赚币|闪赚|申购|竞赛|推广)|\b(?:airdrop|bonus|campaign|competition|earn|event|giveaway|launchpool|prize|promotion|rewards?|share)\b/iu.test(
    item.title,
  );
}

function articleSlugFor(item, occupiedSlugs) {
  const prefix = "okx-event-";
  const maximumLength = 96;
  const raw = `${prefix}${item.officialSlug}`;
  let slug = raw;
  if (slug.length > maximumLength) {
    const suffix = createHash("sha256").update(item.id).digest("hex").slice(0, 8);
    slug = `${raw.slice(0, maximumLength - suffix.length - 1).replace(/-+$/u, "")}-${suffix}`;
  }
  if (!occupiedSlugs.has(slug)) return slug;

  const suffix = createHash("sha256").update(item.id).digest("hex").slice(0, 8);
  slug = `${raw.slice(0, maximumLength - suffix.length - 1).replace(/-+$/u, "")}-${suffix}`;
  if (occupiedSlugs.has(slug)) throw new Error(`无法为 OKX 活动生成唯一 slug：${item.id}`);
  return slug;
}

export function renderOkxActivityArticle(item, verifiedAt) {
  const verifiedDate = new Date(verifiedAt);
  if (Number.isNaN(verifiedDate.getTime())) throw new Error("verifiedAt 不是有效日期");
  const localPublishedAt = [
    item.publishedAt,
    item.sourceUpdatedAt,
    verifiedDate.toISOString(),
  ].sort().at(-1);
  const safeTitle = escapeMarkdown(item.title);
  const shortTitle = [...item.title].slice(0, 120).join("");
  const verifiedDay = verifiedDate.toISOString().slice(0, 10);

  return `---
title: ${yamlString(`${item.title}｜OKX 官方活动入口与参与核验`)}
description: ${yamlString(`OKX 官方活动“${shortTitle}”的来源入口、发布时间和参与前核验要点；资格、地区、期限与奖励以 OKX 规则页为准。`)}
publishedAt: ${yamlString(localPublishedAt)}
updatedAt: ${yamlString(localPublishedAt)}
lastVerifiedAt: ${yamlString(verifiedDate.toISOString())}
author: "onefly"
category: "campaign"
tags: ["okx", "活动", "官方同步"]
cover: ${yamlString(OKX_ACTIVITY_COVER)}
coverAlt: "手机屏幕上的 OKX Wallet 与 OKX 应用图标"
featured: false
status: "active"
exchange: "OKX"
regions: []
riskDisclosure: "活动资格、奖励、时间和地区限制可能变化；本文不构成投资建议，操作前请在 OKX 官方页面再次核验。"
editorialQa:
  - question: "这是 OKX 官方发布的活动吗？"
    answer: ${yamlString(`是。截至 ${verifiedDay}，该页面由 OKX 官方 Latest events 栏目收录；本站同时保留官方入口供再次核验。`)}
  - question: "所有地区和 OKX 用户都能参加吗？"
    answer: "不能只凭活动标题判断。地区、账户类型、身份认证、任务门槛和名额均可能限制资格，应以登录后官方页面显示为准。"
sources:
  - label: ${yamlString(`OKX 官方活动：${item.title}`)}
    url: ${yamlString(item.sourceUrl)}
syncProvider: "okx"
syncSourceId: ${yamlString(item.id)}
syncSourceUrl: ${yamlString(item.sourceUrl)}
syncSourcePublishedAt: ${yamlString(item.publishedAt)}
syncSourceUpdatedAt: ${yamlString(item.sourceUpdatedAt)}
syncSourceHash: ${yamlString(item.sourceHash)}
sidebar: false
tableOfContents:
  minHeadingLevel: 2
  maxHeadingLevel: 3
draft: false
noindex: false
---

## 当前结论

截至 ${verifiedDay}，OKX 官方 Latest events 栏目已收录“${safeTitle}”，官方来源有效。是否能参加仍取决于所在地区、账户状态、活动期限和具体任务，操作前应打开规则页逐项确认。

## 官方信息

- 官方标题：${safeTitle}
- 官方发布时间：${item.publishedAt}
- 官方更新时间：${item.sourceUpdatedAt}
- 官方页面：[查看 OKX 原文](${item.sourceUrl})

## 参与前怎么核验

1. 登录自己的 OKX 账户后打开官方页面，确认页面对当前地区和账户可见。
2. 核对开始时间、结束时间和时区，不把报名时间与任务完成时间混为一谈。
3. 核对充值、交易、持仓或邀请门槛，以及最低金额、奖励上限和名额规则。
4. 记录奖励计算方式与预计发放时间；没有明确写入规则的收益不应视为保证。

## 哪些信息不能只看标题

活动标题不能证明所有用户都有资格，也不能替代完整条款。新用户与老用户、不同国家或地区、个人账户与机构账户可能适用不同条件；若官方页面与本文摘要不一致，以官方页面为准。
`;
}

async function listMarkdownFiles(directory) {
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return listMarkdownFiles(target);
      return /\.mdx?$/iu.test(entry.name) ? [target] : [];
    }),
  );
  return nested.flat();
}

async function discoverExistingArticles(blogRoot) {
  const sourceIds = new Map();
  const occupiedSlugs = new Set();
  for (const file of await listMarkdownFiles(blogRoot)) {
    const slug = path
      .relative(blogRoot, file)
      .replaceAll(path.sep, "/")
      .replace(/\.mdx?$/iu, "");
    occupiedSlugs.add(slug);
    const source = await readFile(file, "utf8");
    const match = source.match(/^syncSourceId:\s*(.+?)\s*$/mu);
    if (!match) continue;
    let sourceId;
    try {
      sourceId = JSON.parse(match[1]);
    } catch {
      throw new Error(`无法读取 ${slug} 的 syncSourceId`);
    }
    if (sourceIds.has(sourceId)) {
      throw new Error(`syncSourceId 重复：${sourceId}`);
    }
    sourceIds.set(sourceId, slug);
  }
  return { sourceIds, occupiedSlugs };
}

function emptyState(sourceUrl) {
  return {
    schemaVersion: OKX_ACTIVITY_STATE_VERSION,
    sourceUrl,
    initialized: false,
    items: [],
  };
}

async function readState(statePath, sourceUrl) {
  let source;
  try {
    source = await readFile(statePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return { state: emptyState(sourceUrl), source: undefined };
    throw error;
  }
  const state = JSON.parse(source);
  if (
    state?.schemaVersion !== OKX_ACTIVITY_STATE_VERSION ||
    state.sourceUrl !== sourceUrl ||
    typeof state.initialized !== "boolean" ||
    !Array.isArray(state.items)
  ) {
    throw new Error("OKX 同步状态文件格式或来源不匹配");
  }
  const ids = new Set();
  for (const item of state.items) {
    if (!item?.id || ids.has(item.id)) throw new Error("OKX 同步状态含无效或重复 ID");
    if (
      item.articleSlug !== null &&
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(item.articleSlug)
    ) {
      throw new Error(`OKX 同步状态含无效 articleSlug：${item.articleSlug}`);
    }
    if (!["article", "baseline", "pending"].includes(item.disposition)) {
      throw new Error(`OKX 同步状态含无效 disposition：${item.disposition}`);
    }
    ids.add(item.id);
  }
  return { state, source };
}

async function writeIfChanged(file, content) {
  let current;
  try {
    current = await readFile(file, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (current === content) return false;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, content, "utf8");
  return true;
}

export async function syncOkxActivityArticles({
  activities,
  blogRoot,
  statePath,
  maxNew = 1,
  sourceUrl = OKX_ACTIVITY_SOURCE_URL,
  verifiedAt = new Date(),
  write = true,
}) {
  if (!Array.isArray(activities) || activities.length === 0) {
    throw new Error("没有可同步的 OKX 活动，已停止写入");
  }
  if (!Number.isInteger(maxNew) || maxNew < 0 || maxNew > 20) {
    throw new Error("maxNew 必须是 0 到 20 的整数");
  }

  const verificationDate = new Date(verifiedAt);
  if (Number.isNaN(verificationDate.getTime())) throw new Error("verifiedAt 不是有效日期");

  const { state, source: previousStateSource } = await readState(statePath, sourceUrl);
  const previousById = new Map(state.items.map((item) => [item.id, item]));
  const { sourceIds, occupiedSlugs } = await discoverExistingArticles(blogRoot);
  const fetchedIds = new Set();
  const discovered = [];
  let updated = 0;

  for (const activity of activities) {
    if (fetchedIds.has(activity.id)) throw new Error(`抓取结果含重复 ID：${activity.id}`);
    fetchedIds.add(activity.id);
    const previous = previousById.get(activity.id);
    if (!previous) discovered.push(activity);
    else if (previous.sourceHash !== activity.sourceHash) updated += 1;
  }

  const previouslyPending = state.items.filter((item) => item.disposition === "pending");
  const pendingById = new Map(previouslyPending.map((item) => [item.id, item]));
  if (!state.initialized) pendingById.clear();
  for (const item of discovered) {
    if (isLikelyOkxActivity(item)) pendingById.set(item.id, item);
  }

  const articleItems = [...pendingById.values()]
    .filter((item) => !sourceIds.has(item.id))
    .sort(compareItems)
    .slice(0, maxNew);
  const newArticleSlugs = new Map();
  for (const item of articleItems) {
    const slug = articleSlugFor(item, occupiedSlugs);
    occupiedSlugs.add(slug);
    newArticleSlugs.set(item.id, slug);
  }

  const mergedById = new Map(state.items.map((item) => [item.id, item]));
  for (const activity of activities) {
    const previous = previousById.get(activity.id);
    mergedById.set(activity.id, {
      ...activity,
      articleSlug:
        previous?.articleSlug ??
        sourceIds.get(activity.id) ??
        newArticleSlugs.get(activity.id) ??
        null,
      disposition:
        previous?.disposition === "article" ||
        sourceIds.has(activity.id) ||
        newArticleSlugs.has(activity.id)
          ? "article"
          : !state.initialized
            ? "baseline"
            : previous?.disposition === "baseline"
              ? "baseline"
              : isLikelyOkxActivity(activity)
                ? "pending"
                : "baseline",
    });
  }
  for (const item of mergedById.values()) {
    if (newArticleSlugs.has(item.id)) {
      item.articleSlug = newArticleSlugs.get(item.id);
      item.disposition = "article";
    }
  }
  const nextState = {
    schemaVersion: OKX_ACTIVITY_STATE_VERSION,
    sourceUrl,
    initialized: true,
    items: [...mergedById.values()].sort(compareItems),
  };
  const nextStateSource = `${JSON.stringify(nextState, null, 2)}\n`;

  let stateChanged = previousStateSource !== nextStateSource;
  const created = [];
  if (write) {
    for (const item of articleItems) {
      const slug = newArticleSlugs.get(item.id);
      const file = path.join(blogRoot, `${slug}.md`);
      const didWrite = await writeIfChanged(
        file,
        renderOkxActivityArticle(item, verificationDate),
      );
      if (!didWrite) throw new Error(`活动文章路径已存在且未被状态识别：${slug}`);
      created.push(slug);
    }
    stateChanged = await writeIfChanged(statePath, nextStateSource);
  } else {
    created.push(...newArticleSlugs.values());
  }

  return {
    sourceUrl,
    fetched: activities.length,
    discovered: discovered.length,
    eligibleDiscovered: discovered.filter(isLikelyOkxActivity).length,
    updated,
    articlesCreated: created.length,
    articleSlugs: created,
    pending: nextState.items.filter((item) => item.disposition === "pending").length,
    changed: stateChanged || created.length > 0,
  };
}

#!/usr/bin/env node

import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const blogRoot = path.join(projectRoot, "src/content/blog");
const publicRoot = path.join(projectRoot, "public");
const referralsPath = path.join(projectRoot, "src/data/referrals.json");

const requiredFields = [
  "title",
  "description",
  "publishedAt",
  "updatedAt",
  "author",
  "category",
  "tags",
  "cover",
  "coverAlt",
  "featured",
  "status",
  "regions",
  "riskDisclosure",
  "editorialQa",
  "sources",
  "draft",
  "noindex",
];

const categories = new Set(["guide", "exchange", "onchain", "campaign", "analysis"]);
const statuses = new Set(["active", "upcoming", "expired", "evergreen", "review"]);
const lockedReferralStandards = {
  okx: { inviteCode: "88596413", benefitTokens: ["20%", "八折"] },
  binance: { inviteCode: "TOSKY", benefitTokens: ["10%"] },
  "okx-dex": { inviteCode: "ONEFLY", benefitTokens: ["20%"] },
};
const affiliateQueryKeys = new Set([
  "aff",
  "affiliate",
  "channelid",
  "invite",
  "invitecode",
  "ref",
  "referral",
  "referralcode",
]);

const errors = [];
const warnings = [];

function report(list, file, message, line) {
  const relative = path.relative(projectRoot, file).replaceAll(path.sep, "/");
  list.push(`${relative}${line ? `:${line}` : ""} ${message}`);
}

async function listMarkdownFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return listMarkdownFiles(target);
      return /\.mdx?$/i.test(entry.name) ? [target] : [];
    }),
  );
  return files.flat().sort();
}

function extractDocument(source) {
  const normalized = source.replace(/^\uFEFF/, "");
  const match = normalized.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return undefined;

  const body = normalized.slice(match[0].length);
  const bodyStartsAt = match[0].split(/\r?\n/).length;
  return { frontmatter: match[1], body, bodyStartsAt };
}

function parseTopLevelFields(frontmatter) {
  const fields = new Map();
  const duplicates = [];
  const lines = frontmatter.split(/\r?\n/);
  let current;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*):(?:[ \t]*(.*))?$/);

    if (match) {
      const [, key, raw = ""] = match;
      if (fields.has(key)) duplicates.push({ key, line: index + 2 });
      current = { key, raw: raw.trim(), block: [], line: index + 2 };
      fields.set(key, current);
      continue;
    }

    if (current && (/^[ \t]+/.test(line) || line.trim() === "")) {
      current.block.push(line);
    }
  }

  return { fields, duplicates };
}

function scalar(field) {
  if (!field) return undefined;
  const value = field.raw.trim();
  if (value.startsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  return value.replace(/[ \t]+#.*$/, "").trim();
}

function isList(field) {
  if (!field) return false;
  return field.raw.startsWith("[") || field.block.some((line) => /^\s*-\s+/.test(line));
}

function listItemCount(field) {
  if (!field) return undefined;
  if (field.raw.startsWith("[")) {
    try {
      const value = JSON.parse(field.raw);
      return Array.isArray(value) ? value.length : undefined;
    } catch {
      return undefined;
    }
  }
  return field.block.filter((line) => /^\s*-\s+(?:question\s*:|\{)/u.test(line)).length;
}

function parseDate(field, file, name) {
  if (!field) return undefined;
  const value = scalar(field);
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) {
    report(errors, file, `frontmatter 的 ${name} 不是有效日期`, field.line);
    return undefined;
  }
  return date;
}

function normalizeUrl(value) {
  try {
    const url = new URL(value);
    url.hash = "";
    url.hostname = url.hostname.toLowerCase();
    if (url.pathname !== "/") url.pathname = url.pathname.replace(/\/$/, "");
    return url.toString();
  } catch {
    return value;
  }
}

function findUrls(body, bodyStartsAt) {
  const matches = [];
  const urlPattern = /https?:\/\/[^\s<>"'()[\]]+/giu;

  for (const match of body.matchAll(urlPattern)) {
    const raw = match[0].replace(/[\])},.;!?，。；！？、]+$/u, "");
    const prefix = body.slice(0, match.index);
    matches.push({
      url: raw,
      line: bodyStartsAt + prefix.split(/\r?\n/).length - 1,
    });
  }

  return matches;
}

function isAffiliateUrl(value, knownUrls, inviteCodes) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }

  if (knownUrls.has(normalizeUrl(value))) return true;

  for (const key of url.searchParams.keys()) {
    if (affiliateQueryKeys.has(key.toLowerCase())) return true;
  }

  const pathname = decodeURIComponent(url.pathname).toLowerCase();
  const looksLikeInvitePath = /(?:^|\/)(?:invite|join|joindex|referral)(?:\/|$)/u.test(pathname);
  const decodedUrl = decodeURIComponent(value).toLowerCase();
  return looksLikeInvitePath && inviteCodes.some((code) => decodedUrl.includes(code));
}

function validateTiming(file, fields, now) {
  const status = scalar(fields.get("status"));
  const startsAt = parseDate(fields.get("startsAt"), file, "startsAt");
  const expiresAt = parseDate(fields.get("expiresAt"), file, "expiresAt");

  if (startsAt && expiresAt && startsAt >= expiresAt) {
    report(errors, file, "startsAt 必须早于 expiresAt", fields.get("expiresAt").line);
  }

  if (expiresAt && expiresAt <= now && status !== "expired") {
    report(errors, file, `expiresAt 已过期，status 应为 expired（当前为 ${status}）`, fields.get("status")?.line);
  }

  if (expiresAt && expiresAt > now && status === "expired") {
    report(errors, file, "expiresAt 尚未到期，status 不能为 expired", fields.get("status")?.line);
  }

  if (status === "upcoming" && !startsAt) {
    report(errors, file, "status 为 upcoming 时必须提供 startsAt", fields.get("status")?.line);
  }

  if (status === "upcoming" && startsAt && startsAt <= now) {
    report(errors, file, "startsAt 已到，status 不应继续为 upcoming", fields.get("status")?.line);
  }

  if (status === "active" && startsAt && startsAt > now) {
    report(errors, file, "startsAt 尚未到，status 应为 upcoming", fields.get("status")?.line);
  }

  if (status === "expired" && startsAt && startsAt > now) {
    report(errors, file, "startsAt 尚未到，status 不能为 expired", fields.get("status")?.line);
  }
}

async function validateCover(file, field) {
  const cover = scalar(field);
  if (!cover) return;

  if (!cover.startsWith("/") || cover.startsWith("//") || /^https?:/iu.test(cover)) {
    report(errors, file, "cover 必须是 public 下以 / 开头的本地路径", field.line);
    return;
  }

  const pathname = cover.split(/[?#]/u, 1)[0];
  const target = path.resolve(publicRoot, `.${pathname}`);
  const relative = path.relative(publicRoot, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    report(errors, file, "cover 路径不能离开 public 目录", field.line);
    return;
  }

  try {
    await access(target);
  } catch {
    report(errors, file, `cover 文件不存在：public/${relative.replaceAll(path.sep, "/")}`, field.line);
  }
}

async function validateFile(file, affiliateData, now) {
  const source = await readFile(file, "utf8");
  const document = extractDocument(source);
  if (!document) {
    report(errors, file, "缺少文件开头的 YAML frontmatter");
    return;
  }

  const { fields, duplicates } = parseTopLevelFields(document.frontmatter);
  for (const duplicate of duplicates) {
    report(errors, file, `frontmatter 字段 ${duplicate.key} 重复`, duplicate.line);
  }

  for (const field of requiredFields) {
    if (!fields.has(field)) report(errors, file, `缺少必需 frontmatter 字段：${field}`);
  }

  for (const field of [
    "title",
    "description",
    "author",
    "category",
    "cover",
    "coverAlt",
    "status",
    "riskDisclosure",
  ]) {
    const entry = fields.get(field);
    if (entry && !scalar(entry)) report(errors, file, `${field} 不能为空`, entry.line);
  }

  for (const field of ["featured", "draft", "noindex"]) {
    const entry = fields.get(field);
    if (entry && !["true", "false"].includes(scalar(entry))) {
      report(errors, file, `${field} 必须是 true 或 false`, entry.line);
    }
  }

  const slug = path
    .relative(blogRoot, file)
    .replaceAll(path.sep, "/")
    .replace(/\.mdx?$/iu, "");
  if (!slug.split("/").every((part) => /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(part))) {
    report(errors, file, "文件名即 URL slug，必须使用小写字母、数字和单连字符");
  }

  const category = scalar(fields.get("category"));
  if (category && !categories.has(category)) {
    report(errors, file, `category 不受支持：${category}`, fields.get("category").line);
  }

  const status = scalar(fields.get("status"));
  if (status && !statuses.has(status)) {
    report(errors, file, `status 不受支持：${status}`, fields.get("status").line);
  }

  for (const field of ["tags", "regions", "editorialQa", "sources"]) {
    const entry = fields.get(field);
    if (entry && !isList(entry)) report(errors, file, `${field} 必须是 YAML 数组`, entry.line);
  }

  const editorialQa = fields.get("editorialQa");
  const editorialQaCount = listItemCount(editorialQa);
  const editorialQaSource = editorialQa
    ? [editorialQa.raw, ...editorialQa.block].join("\n")
    : "";
  if (editorialQa && editorialQaCount === undefined) {
    report(errors, file, "editorialQa 必须是可解析的问答数组", editorialQa.line);
  } else if (editorialQa && editorialQaCount < 2) {
    report(errors, file, "editorialQa 至少需要 2 组编辑问答", editorialQa.line);
  } else if (editorialQa && editorialQaCount > 4) {
    report(errors, file, "editorialQa 最多保留 4 组高相关问答", editorialQa.line);
  }
  if (scalar(fields.get("draft")) !== "true" && /\bTODO\b/iu.test(editorialQaSource)) {
    report(errors, file, "已发布文章的 editorialQa 不能包含 TODO", editorialQa?.line);
  }
  if (
    /(?:^|[\s"'{,])(?:nickname|visitor|ip(?:Address)?|location|device|phone(?:Model)?|昵称|游客|所在地|手机型号)\s*:/imu.test(
      editorialQaSource,
    )
  ) {
    report(errors, file, "editorialQa 不能包含伪造的身份、设备、IP 或所在地字段", editorialQa?.line);
  }

  const coverAlt = scalar(fields.get("coverAlt"));
  if (coverAlt && [...coverAlt].length < 4) {
    report(errors, file, "coverAlt 至少需要 4 个字符", fields.get("coverAlt").line);
  }

  const publishedAt = parseDate(fields.get("publishedAt"), file, "publishedAt");
  const updatedAt = parseDate(fields.get("updatedAt"), file, "updatedAt");
  parseDate(fields.get("lastVerifiedAt"), file, "lastVerifiedAt");
  if (publishedAt && updatedAt && updatedAt < publishedAt) {
    report(errors, file, "updatedAt 不能早于 publishedAt", fields.get("updatedAt").line);
  }

  validateTiming(file, fields, now);
  await validateCover(file, fields.get("cover"));

  const affiliateKey = scalar(fields.get("affiliateKey"));
  if (affiliateKey && !(affiliateKey in affiliateData.referrals)) {
    report(errors, file, `affiliateKey 未在 src/data/referrals.json 定义：${affiliateKey}`, fields.get("affiliateKey").line);
  }

  const seenAffiliateUrls = new Set();
  const urlMatches = [
    ...findUrls(document.body, document.bodyStartsAt),
    ...findUrls(editorialQaSource, editorialQa?.line ?? 1),
  ];
  for (const match of urlMatches) {
    const normalized = normalizeUrl(match.url);
    if (seenAffiliateUrls.has(normalized)) continue;
    seenAffiliateUrls.add(normalized);
    if (isAffiliateUrl(match.url, affiliateData.knownUrls, affiliateData.inviteCodes)) {
      report(
        errors,
        file,
        `正文中不能硬编码返佣链接：${match.url}；请使用 affiliateKey/返佣组件（sources 中允许来源 URL）`,
        match.line,
      );
    }
  }
}

async function loadAffiliateData() {
  const referrals = JSON.parse(await readFile(referralsPath, "utf8"));
  for (const [key, standard] of Object.entries(lockedReferralStandards)) {
    const referral = referrals[key];
    if (!referral) {
      report(errors, referralsPath, `缺少已锁定的返佣配置：${key}`);
      continue;
    }
    if (String(referral.inviteCode) !== standard.inviteCode) {
      report(errors, referralsPath, `${key} 邀请码必须保持为 ${standard.inviteCode}`);
    }
    for (const token of standard.benefitTokens) {
      if (!String(referral.benefit ?? "").includes(token)) {
        report(errors, referralsPath, `${key} 优惠说明必须保留已验证标准 ${token}`);
      }
    }
  }
  const values = Object.values(referrals);
  return {
    referrals,
    knownUrls: new Set(values.map((item) => item.url).filter(Boolean).map(normalizeUrl)),
    inviteCodes: values.map((item) => String(item.inviteCode ?? "").toLowerCase()).filter(Boolean),
  };
}

async function main() {
  const affiliateData = await loadAffiliateData();
  const files = await listMarkdownFiles(blogRoot);
  const configuredNow = process.env.CONTENT_CHECK_NOW;
  const now = configuredNow ? new Date(configuredNow) : new Date();

  if (Number.isNaN(now.getTime())) {
    throw new Error("CONTENT_CHECK_NOW 必须是有效日期");
  }
  if (files.length === 0) warnings.push("src/content/blog 中没有 Markdown 文章");

  for (const file of files) await validateFile(file, affiliateData, now);

  for (const warning of warnings) console.warn(`WARN  ${warning}`);
  if (errors.length > 0) {
    console.error(`内容检查失败（${errors.length} 项）：`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`内容检查通过：${files.length} 篇文章，封面、时效状态和返佣链接均符合规则。`);
}

main().catch((error) => {
  console.error(`内容检查无法运行：${error.message}`);
  process.exitCode = 1;
});

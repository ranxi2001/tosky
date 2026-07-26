import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  assertOfficialOkxUrl,
  parseOkxActivityPage,
  syncOkxActivityArticles,
} from "../scripts/lib/okx-activity-sync.mjs";

const testRoot = path.dirname(fileURLToPath(import.meta.url));
const fixture = await readFile(path.join(testRoot, "fixtures/okx-latest-events.html"), "utf8");

test("解析 OKX SSR 活动列表并规范化来源", () => {
  const page = parseOkxActivityPage(fixture);
  assert.equal(page.total, 3);
  assert.equal(page.items[0].title, "Alpha & Beta rewards");
  assert.equal(page.items[0].sourceUrl, "https://www.okx.com/help/alpha-rewards");
  assert.match(page.items[0].sourceHash, /^sha256:[a-f0-9]{64}$/u);
});

test("拒绝非 OKX HTTPS 来源", () => {
  assert.throws(() => assertOfficialOkxUrl("https://example.com/help/event"), /只允许访问/u);
  assert.throws(() => assertOfficialOkxUrl("http://www.okx.com/help/event"), /只允许访问/u);
});

test("可收录文章首次生成、重复运行幂等且不覆盖人工编辑", async () => {
  const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "tosky-okx-sync-"));
  const blogRoot = path.join(temporaryRoot, "blog");
  const statePath = path.join(temporaryRoot, "okx-activity-sync.json");
  const activities = parseOkxActivityPage(fixture).items;

  try {
    const first = await syncOkxActivityArticles({
      activities,
      blogRoot,
      statePath,
      maxNew: 2,
      verifiedAt: "2026-07-22T00:00:00.000Z",
    });
    assert.equal(first.discovered, 3);
    assert.equal(first.articlesCreated, 2);

    const firstArticle = path.join(blogRoot, `${first.articleSlugs[0]}.md`);
    const generated = await readFile(firstArticle, "utf8");
    assert.match(generated, /^draft: false$/mu);
    assert.match(generated, /^noindex: false$/mu);
    assert.match(generated, /^lastVerifiedAt: "2026-07-22T00:00:00.000Z"$/mu);
    assert.doesNotMatch(generated, /TODO/iu);

    const stateAfterFirst = await readFile(statePath, "utf8");
    const second = await syncOkxActivityArticles({
      activities,
      blogRoot,
      statePath,
      maxNew: 2,
      verifiedAt: "2026-07-23T00:00:00.000Z",
    });
    assert.equal(second.changed, false);
    assert.equal(second.articlesCreated, 0);
    assert.equal(await readFile(statePath, "utf8"), stateAfterFirst);

    await writeFile(firstArticle, `${generated}\n人工编辑保留标记\n`, "utf8");
    const changedActivities = activities.map((item, index) =>
      index === 0
        ? {
            ...item,
            title: "Alpha and Beta rewards updated",
            sourceUpdatedAt: "2026-07-21T12:00:00.000Z",
            sourceHash: item.sourceHash.replace(/.$/u, item.sourceHash.endsWith("0") ? "1" : "0"),
          }
        : item,
    );
    const third = await syncOkxActivityArticles({
      activities: changedActivities,
      blogRoot,
      statePath,
      maxNew: 2,
      verifiedAt: "2026-07-24T00:00:00.000Z",
    });
    assert.equal(third.updated, 1);
    assert.match(await readFile(firstArticle, "utf8"), /人工编辑保留标记/u);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { build } from "esbuild";

const referrals = JSON.parse(await readFile(new URL("../src/data/referrals.json", import.meta.url), "utf8"));

async function buildWorker(config) {
  const result = await build({
    entryPoints: [fileURLToPath(new URL("../src/worker.ts", import.meta.url))],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    plugins: config ? [{
      name: "referrals-build-fixture",
      setup(builder) {
        builder.onLoad({ filter: /[/\\]src[/\\]data[/\\]referrals\.json$/ }, () => ({
          contents: JSON.stringify(config),
          loader: "json",
        }));
      },
    }] : [],
  });
  return (await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`)).default;
}

const worker = await buildWorker();
const noAssets = { ASSETS: { fetch() { throw new Error("Redirect must not reach ASSETS"); } } };

test("GET/HEAD、/okx 与 /okx/、根域与 www 均直达集中配置，302 且 no-store", async () => {
  for (const method of ["GET", "HEAD"]) {
    for (const host of ["tosky.top", "www.tosky.top"]) {
      for (const pathname of ["/okx", "/okx/"]) {
        const response = await worker.fetch(new Request(`https://${host}${pathname}`, { method }), noAssets);
        assert.equal(response.status, 302);
        assert.equal(response.headers.get("location"), referrals.okx.url);
        assert.equal(response.headers.get("cache-control"), "no-store");
        assert.equal(await response.text(), "");
      }
    }
  }
  assert.equal(new URL(referrals.okx.url).pathname, "/join/88596413");
});

test("忽略任意目标/邀请码/query/hash 参数，不提供开放跳转", async () => {
  for (const host of ["tosky.top", "www.tosky.top"]) {
    const request = new Request(`https://${host}/okx/?url=https://evil.invalid/&redirect=//evil.invalid&inviteCode=wrong#untrusted`);
    const response = await worker.fetch(request, noAssets);
    assert.equal(response.status, 302);
    assert.equal(response.headers.get("location"), referrals.okx.url);
    assert.equal(new URL(response.headers.get("location")).search, "");
    assert.equal(new URL(response.headers.get("location")).hash, "");
  }
});

test("集中配置在新构建中更新即改变短链目标，无需改 Worker 源码", async () => {
  const updated = structuredClone(referrals);
  updated.okx.url = "https://www.updated-example.com/join/88596413";
  const rebuilt = await buildWorker(updated);
  const response = await rebuilt.fetch(new Request("https://tosky.top/okx"), noAssets);
  assert.equal(response.headers.get("location"), updated.okx.url);
  assert.equal(response.status, 302);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal((await worker.fetch(new Request("https://tosky.top/okx"), noAssets)).headers.get("location"), referrals.okx.url);
});

test("其他路由/内容资源完整交给 ASSETS，不新增其他平台或相似路径重定向", async () => {
  for (const pathname of ["/", "/home/", "/blog/", "/okx/index.md", "/okx/index.mdx", "/okx/extra", "/okxx", "/OKX", "/binance", "/okx-dex", "/missing"]) {
    const request = new Request(`https://tosky.top${pathname}?keep=1`);
    const expected = new Response("asset response", { status: pathname === "/missing" ? 404 : 200 });
    let calls = 0;
    const response = await worker.fetch(request, { ASSETS: { async fetch(forwarded) {
      calls += 1;
      assert.equal(forwarded, request);
      return expected;
    } } });
    assert.equal(calls, 1);
    assert.equal(response, expected);
  }
});

test("既有 www 规范化仍为 308，保留所有其他路径、query 和方法", async () => {
  for (const method of ["GET", "HEAD"]) {
    for (const pathname of ["/", "/blog/", "/okx/index.md", "/binance"]) {
      const response = await worker.fetch(new Request(`https://www.tosky.top${pathname}?source=kept`, { method }), noAssets);
      assert.equal(response.status, 308);
      assert.equal(response.headers.get("location"), `https://tosky.top${pathname}?source=kept`);
    }
  }
});

const siteUrl = new URL(process.env.SITE_URL ?? "https://tosky.top");
const attempts = Number.parseInt(process.env.PRODUCTION_CHECK_ATTEMPTS ?? "24", 10);
const intervalMs = Number.parseInt(process.env.PRODUCTION_CHECK_INTERVAL_MS ?? "10000", 10);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function fetchResult(path, options = {}) {
  const url = path.startsWith("http") ? new URL(path) : new URL(path, siteUrl);
  const response = await fetch(url, {
    redirect: options.redirect ?? "follow",
    headers: { "user-agent": "ToSky production check" },
  });

  return {
    body: await response.text(),
    contentType: response.headers.get("content-type") ?? "",
    location: response.headers.get("location") ?? "",
    status: response.status,
    url: response.url,
  };
}

async function inspectProduction() {
  const failures = [];
  const [root, home, okx, article, robots, sitemap, rss, llms, legacyRss, legacySitemap, legacyTag, www] =
    await Promise.all([
      fetchResult("/"),
      fetchResult("/home/"),
      fetchResult("/okx/?source=production-check", { redirect: "manual" }),
      fetchResult("/blog/okx-and-binance-discount/"),
      fetchResult("/robots.txt"),
      fetchResult("/sitemap.xml"),
      fetchResult("/rss.xml"),
      fetchResult("/llms.txt"),
      fetchResult("/rss", { redirect: "manual" }),
      fetchResult("/api/sitemap", { redirect: "manual" }),
      fetchResult("/tags/okx/", { redirect: "manual" }),
      fetchResult("https://www.tosky.top/blog/?source=production-check", {
        redirect: "manual",
      }),
    ]);

  const expect = (condition, message) => {
    if (!condition) failures.push(message);
  };

  expect(root.status === 200, `根路径状态应为 200，实际为 ${root.status}`);
  expect(root.contentType.includes("text/html"), `根路径 Content-Type 异常：${root.contentType}`);
  expect(
    root.body.includes('<link rel="canonical" href="https://tosky.top/">'),
    "根路径缺少根域 canonical",
  );
  expect(
    root.body.includes("OKX 欧易注册、下载与策略交易指南"),
    "根路径未显示 OKX 指南",
  );
  expect(home.status === 200, `/home/ 状态应为 200，实际为 ${home.status}`);
  expect(
    home.body.includes('<link rel="canonical" href="https://tosky.top/home/">'),
    "/home/ canonical 异常",
  );
  expect(home.body.includes(">ToSky</h1>"), "/home/ 未显示原聚合首页");
  expect(okx.status === 308, `/okx/ 应返回 308，实际为 ${okx.status}`);
  expect(
    okx.location === "https://tosky.top/?source=production-check",
    `/okx/ 重定向未保留查询参数：${okx.location}`,
  );
  expect(article.status === 200, `文章页状态应为 200，实际为 ${article.status}`);
  expect(
    article.body.includes(
      '<link rel="canonical" href="https://tosky.top/blog/okx-and-binance-discount/">',
    ),
    "文章页 canonical 异常",
  );
  expect(robots.status === 200, `robots.txt 状态应为 200，实际为 ${robots.status}`);
  expect(
    robots.body.includes("Sitemap: https://tosky.top/sitemap.xml"),
    "robots.txt 缺少主 Sitemap",
  );
  expect(sitemap.status === 200, `Sitemap 状态应为 200，实际为 ${sitemap.status}`);
  expect(sitemap.body.includes("<loc>https://tosky.top/</loc>"), "Sitemap 主域异常");
  expect(sitemap.body.includes("<loc>https://tosky.top/home/</loc>"), "Sitemap 缺少 /home/");
  expect(rss.status === 200, `RSS 状态应为 200，实际为 ${rss.status}`);
  expect(rss.body.includes("https://tosky.top/"), "RSS 未使用主域 URL");
  expect(llms.status === 200, `llms.txt 状态应为 200，实际为 ${llms.status}`);
  expect(llms.body.includes("# ToSky"), "llms.txt 内容异常");

  const redirects = [
    [legacyRss, 301, "/rss.xml", "/rss"],
    [legacySitemap, 301, "/sitemap.xml", "/api/sitemap"],
    [legacyTag, 301, "/tag/okx/", "/tags/okx/"],
  ];

  for (const [result, status, target, source] of redirects) {
    expect(result.status === status, `${source} 应返回 ${status}，实际为 ${result.status}`);
    expect(new URL(result.location, siteUrl).pathname === target, `${source} 重定向目标异常`);
  }

  expect(www.status === 308, `www 应返回 308，实际为 ${www.status}`);
  expect(
    www.location === "https://tosky.top/blog/?source=production-check",
    `www 重定向未保留路径或查询参数：${www.location}`,
  );

  return failures;
}

if (!Number.isInteger(attempts) || attempts < 1 || !Number.isInteger(intervalMs) || intervalMs < 0) {
  throw new Error("生产检查次数必须为正整数，间隔必须为非负整数。");
}

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  try {
    const failures = await inspectProduction();
    if (failures.length === 0) {
      console.log(`生产检查通过：${siteUrl.origin}`);
      process.exit(0);
    }

    if (attempt === attempts) {
      throw new Error(failures.join("\n- "));
    }

    console.log(`生产站尚未就绪（${attempt}/${attempts}）：${failures.join("；")}`);
  } catch (error) {
    if (attempt === attempts) throw error;
    console.log(`生产检查请求失败（${attempt}/${attempts}）：${error.message}`);
  }

  await sleep(intervalMs);
}

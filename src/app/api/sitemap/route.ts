import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";
import { wisp } from "@/lib/wisp";

const directories = ["about", "blog", "okx", "static"];

function getRoutes(dir: string): string[] {
    const dirPath = path.join(process.cwd(), "src", "app", dir);
    if (!fs.existsSync(dirPath)) return [];

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    let routes: string[] = [];

    for (const entry of entries) {
        if (entry.isDirectory()) {
            // 递归
            const subRoutes = getRoutes(path.join(dir, entry.name));
            routes.push(...subRoutes);
        } else if (
            entry.isFile() &&
            (entry.name === "page.tsx" || entry.name === "page.js")
        ) {
            let routePath = "/" + dir.replace(/\\/g, "/");
            routePath = routePath.replace(/\[.*?\]/g, "example");
            routes.push(routePath);
        }
    }

    return routes;
}

export async function GET() {
    let allRoutes: string[] = [];

    // 本地静态路径
    directories.forEach((dir) => {
        const routes = getRoutes(dir);
        allRoutes.push(...routes);
    });

    // 动态文章
    const postsResult = await wisp.getPosts();
    const dynamicRoutes = postsResult.posts.map((post) => `/blog/${post.slug}`);
    allRoutes.push(...dynamicRoutes);

    // 去重
    allRoutes = [...new Set(allRoutes)].sort();

    // 生成 sitemap
    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${allRoutes
        .map(
            (url) => `<url><loc>https://tosky.top${url}</loc></url>`
        )
        .join("\n")}
</urlset>`;

    return new NextResponse(sitemap, {
        headers: {
            "Content-Type": "application/xml",
        },
    });
}

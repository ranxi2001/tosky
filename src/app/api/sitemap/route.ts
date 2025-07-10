import fs from "fs";
import path from "path";
import { NextResponse } from "next/server";

// 定义要扫描的目录
const directories = [
    "about",
    "blog",
    "okx",
    "static"
];

function getRoutes(dir: string) {
    const dirPath = path.join(process.cwd(), "src", "app", dir);
    if (!fs.existsSync(dirPath)) return [];

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });

    const routes: string[] = [];

    for (const entry of entries) {
        if (entry.isDirectory()) {
            // 递归子目录
            const subRoutes = getRoutes(path.join(dir, entry.name));
            routes.push(...subRoutes);
        } else if (
            entry.isFile() &&
            (entry.name === "page.tsx" || entry.name === "page.js")
        ) {
            // 去掉 "page.tsx"
            const routePath = "/" + dir.replace(/\\/g, "/");
            routes.push(routePath === "/about" ? "/about" : routePath);
        }
    }

    return routes;
}

export async function GET() {
    let allRoutes: string[] = [];

    directories.forEach((dir) => {
        const routes = getRoutes(dir);
        allRoutes.push(...routes);
    });

    // 去重
    allRoutes = [...new Set(allRoutes)];

    // 生成 sitemap XML
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

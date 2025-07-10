import { NextResponse } from "next/server";

export async function GET() {
    const content = `
User-agent: *
Allow: /

Sitemap: https://tosky.top/api/sitemap
`;

    return new NextResponse(content.trim(), {
        headers: {
            "Content-Type": "text/plain",
        },
    });
}

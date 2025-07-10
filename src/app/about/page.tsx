import fs from "fs";
import path from "path";
import { Footer } from "@/components/Footer";
import { Header } from "@/components/Header";
import { config } from "@/config";
import { signOgImageUrl } from "@/lib/og-image";
import Markdown from "react-markdown";

export async function generateMetadata() {
  return {
    title: "OKX 教程 - 进入 Web3 世界",
    description: "详细的 OKX 注册、下载、策略交易和理财教程",
    openGraph: {
      title: "OKX 教程 - 进入 Web3 世界",
      description: "详细的 OKX 注册、下载、策略交易和理财教程",
      images: [
        signOgImageUrl({
          title: "OKX 教程",
          label: "完整指南",
          brand: config.blog.name,
        }),
      ],
    },
  };
}

export default function Page() {
  // 🚀 使用绝对路径
  const filePath = path.join(process.cwd(), "src", "app", "about", "aboutokx.md");
  const content = fs.readFileSync(filePath, "utf8");

  return (
      <div className="container mx-auto px-5">
        <Header />
        <div className="prose lg:prose-lg dark:prose-invert m-auto mt-20 mb-10 blog-content">
          <Markdown>{content}</Markdown>
        </div>
        <Footer />
      </div>
  );
}

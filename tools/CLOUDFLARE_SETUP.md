# 历史 Cloudflare 联动流程已停用

此前从 Notion 推导域名并直接更新 Cloudflare 的流程已退役。`domain_monitor.py`、`link_updater.py`、`quick_setup_cloudflare.py` 与快捷检查入口均明确失败，不会读取配置、请求网络、操作 Git 或调用 Cloudflare API。

注册链接同步改用 Playwright Chromium 真实渲染固定公开 Notion 页面，由独立 automation 分支维护 Draft PR，人工合并后才进入既有发布流程。新流程无需 Cloudflare token，不修改重定向规则，不提供静态 HTML 或 URL slug fallback。

请按 [工具迁移说明](README.md) 和根目录 README 的“OKX 注册入口动态同步”安装、测试和运行 dry-run，并移除调用旧 Python 工具的定时任务。遗留 `cloudflare_config.json` 和链接配置不由新流程使用，不要提交私有配置。

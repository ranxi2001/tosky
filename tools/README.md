# 旧域名同步工具已停用

注册链接同步已迁移到 `scripts/sync-okx-referral.mjs` 与独立 `.github/workflows/sync-okx-referral.yml`。从仓库根目录运行：

```bash
PLAYWRIGHT_BROWSERS_PATH=/data/development/cache/ms-playwright npm run sync:okx-referral -- --dry-run
```

完整安装、验证、App 最小权限和直接 fast-forward main 流程见根目录 README 的“OKX 注册入口动态同步”。新同步不使用额外分支或 PR；完成校验和构建后，只有最小白名单变更才通过 Contents write App 安装令牌推送 main，触发现有部署链。并发或远端拒绝时明确失败。新流程不读取 `tools/link_config.json` 或 `tools/cloudflare_config.json`，不需要 Cloudflare token。

旧 `link_updater.py` 从 Notion URL slug 猜域名，`domain_monitor.py` 会选择静态 HTML 中任意 `.com` 并回退到 slug。这些逻辑无法跟踪同一页面正文更新，也可能把官方验证页、资源域名或 APK 当成注册链接，现已删除。

以下入口保留为明确失败的迁移提示：

- `link_updater.py`：运行和导入均失败；不再提交、推送 Git 或调用 Cloudflare。
- `domain_monitor.py`：运行和导入均失败；不再提供旧监控类。
- `quick_setup_cloudflare.py`、`quick_check.bat`：已停用，避免继续引导到旧解析器。

请移除主机上调用这些旧工具的 cron/计划任务，改用独立 GitHub workflow。遗留配置示例不再被同步器使用，不能作为当前域名依据。

`cloudflare_updater.py` 是遗留的独立手动管理工具，不属于新同步流程；本次同步不运行它，不读取其私有配置，也不修改任何 Cloudflare 规则。新的注册链接只在 `src/data/referrals.json` 的 `okx.url` 中维护，邀请码 `88596413`、20%、officialUrl、DEX 和 Binance 不变。

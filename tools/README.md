# OKX 域名自动更新工具

自动监控官方域名变化，更新网站链接并同步 Cloudflare 301 重定向规则。

## 功能特性

- 🔗 **链接自动更新**: 检测域名变化后自动更新 `page.tsx` 中的注册链接
- ☁️ **Cloudflare 同步**: 自动更新 301 重定向规则
- 🚀 **自动部署**: git push 触发 Vercel 自动部署
- 📝 **精确替换**: 使用配置文件记录链接，精确替换无遗漏

## 文件说明

| 文件 | 说明 |
|------|------|
| `link_updater.py` | 主脚本 - 更新链接 + Cloudflare + Git 推送 |
| `link_config.json` | 链接配置（当前链接、目标文件列表） |
| `cloudflare_config.json` | Cloudflare API 配置 |
| `domain_monitor.py` | 域名监控基础类 |
| `cloudflare_updater.py` | Cloudflare API 封装 |

## 快速开始

### 1. 安装依赖

```bash
pip install requests
```

### 2. 配置文件

复制示例配置并填入实际值：

```bash
cp link_config.json.example link_config.json
cp cloudflare_config.json.example cloudflare_config.json
```

**link_config.json**:
```json
{
  "current_link": "https://www.example.com/join/88596413",
  "invite_code": "88596413",
  "files": [
    "/home/tosky/src/app/page.tsx",
    "/home/tosky/src/app/okx/page.tsx"
  ],
  "notion_url": "https://conscious-meerkat-b7e.notion.site/APK-www-xxx-com-join-xxx",
  "last_updated": null
}
```

**cloudflare_config.json**:
```json
{
  "api_token": "your_cloudflare_api_token",
  "zone_id": "your_zone_id",
  "ruleset_id": "your_ruleset_id",
  "rule_id": "your_rule_id",
  "source_pattern": "(http.request.full_uri wildcard r\"https://onefly.top/posts/8888.html\")",
  "redirect_suffix": "/join/88596413"
}
```

### 3. 运行脚本

```bash
cd /home/tosky/tools
python3 link_updater.py
```

选择运行模式：
- **1** - 单次检查并更新
- **2** - 持续监控模式

## 工作流程

```
1. 从 Notion URL 标题提取最新域名
   URL: APK-www-newdomain-com-join-xxx
   提取: www.newdomain.com

2. 构建完整链接
   https://www.newdomain.com/join/88596413

3. 更新文件（精确替换）
   - src/app/page.tsx
   - src/app/okx/page.tsx

4. 更新 Cloudflare 301 重定向
   From: https://onefly.top/posts/8888.html
   To:   https://www.newdomain.com/join/88596413

5. Git 提交并推送
   自动触发 Vercel 部署
```

## 服务器定时任务

### 每 4 小时自动运行一次

```bash
# 编辑 crontab
crontab -e

# 添加以下行（每 4 小时运行一次）
0 */4 * * * cd /home/tosky/tools && /usr/bin/python3 -c "from link_updater import LinkUpdater; u=LinkUpdater(); u.check_and_update()" >> /home/tosky/tools/cron.log 2>&1
```

### 其他定时选项

```bash
# 每小时运行
0 * * * * cd /home/tosky/tools && /usr/bin/python3 -c "from link_updater import LinkUpdater; u=LinkUpdater(); u.check_and_update()" >> /home/tosky/tools/cron.log 2>&1

# 每 6 小时运行
0 */6 * * * cd /home/tosky/tools && /usr/bin/python3 -c "from link_updater import LinkUpdater; u=LinkUpdater(); u.check_and_update()" >> /home/tosky/tools/cron.log 2>&1

# 每天凌晨 2 点运行
0 2 * * * cd /home/tosky/tools && /usr/bin/python3 -c "from link_updater import LinkUpdater; u=LinkUpdater(); u.check_and_update()" >> /home/tosky/tools/cron.log 2>&1
```

### 查看定时任务

```bash
# 查看当前 crontab
crontab -l

# 查看运行日志
tail -f /home/tosky/tools/cron.log
```

## 日志示例

```
==================================================
链接自动更新脚本启动
当前链接: https://www.firgrouxywebb.com/join/88596413
==================================================

检测到链接变化:
  当前: https://www.oldomain.com/join/88596413
  新的: https://www.newdomain.com/join/88596413

已更新: /home/tosky/src/app/page.tsx
已更新: /home/tosky/src/app/okx/page.tsx
共更新 2 个文件

==================================================
Cloudflare 301 重定向规则更新成功
--------------------------------------------------
Rule name: okx
From: https://onefly.top/posts/8888.html
To:   https://www.newdomain.com/join/88596413
Status: 301 Permanent Redirect
==================================================

git commit 成功: chore: 自动更新注册链接为 https://www.newdomain.com/join/88596413
git push 成功，部署将自动触发
链接更新完成!
```

## 手动触发更新

如果需要手动更新（不等待定时任务）：

```bash
cd /home/tosky/tools

# 方式1: 交互模式
python3 link_updater.py

# 方式2: 直接运行
python3 -c "from link_updater import LinkUpdater; u=LinkUpdater(); u.check_and_update()"

# 方式3: 只更新 Cloudflare
python3 -c "from link_updater import LinkUpdater; u=LinkUpdater(); u.update_cloudflare(u.config['current_link'])"
```

## 更新域名源

当 Notion 页面 URL 变化时，需要更新 `link_config.json` 中的 `notion_url`：

```bash
# 编辑配置
nano /home/tosky/tools/link_config.json

# 修改 notion_url 为新的 URL
# "notion_url": "https://xxx.notion.site/APK-www-newdomain-com-join-xxx"

# 然后运行脚本
python3 link_updater.py
```

## 注意事项

- ⚠️ `cloudflare_config.json` 和 `link_config.json` 包含敏感信息，已加入 `.gitignore`
- 🔒 请勿将配置文件提交到公开仓库
- 📋 首次使用请复制 `.example` 文件并填入实际配置

## 更新日志

### v2.0.0 (2026-01-19)
- ✨ 新增 `link_updater.py` 一站式更新脚本
- ✨ 支持多文件批量更新
- ✨ 集成 Cloudflare 动态重定向更新
- ✨ 使用配置文件精确替换链接
- ✨ 自动 git commit + push
- 🔒 敏感配置文件加入 .gitignore

### v1.0.0 (2026-01-19)
- ✨ 初始版本 domain_monitor.py
- ✨ 支持从 Notion 页面提取域名
- ✨ 支持域名变化监控

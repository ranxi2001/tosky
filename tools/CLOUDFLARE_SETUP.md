# Cloudflare 自动更新配置指南

## 概述

此功能允许域名监控脚本在检测到域名变化时，自动更新 Cloudflare 的 301 重定向规则。

![Cloudflare 配置截图](file:///C:/Users/ranxi/.gemini/antigravity/brain/f6ab4681-31e0-41f1-b2f4-015d3f2ea2d7/uploaded_image_1768809477963.png)

## 配置步骤

### 1. 获取 Cloudflare API Token

1. 登录 [Cloudflare 控制台](https://dash.cloudflare.com)
2. 点击右上角头像 → **My Profile**
3. 左侧菜单选择 **API Tokens**
4. 点击 **Create Token**
5. 选择 **Create Custom Token**
6. 配置权限：
   - **Zone - Zone Settings - Edit**
   - **Zone - Dynamic Redirect - Edit**
   - 或者使用 **Edit zone** 模板（权限更广泛）
7. **Zone Resources** 选择你要操作的域名（例如：`onefly.top`）
8. 点击 **Continue to summary** → **Create Token**
9. **复制并保存生成的 Token**（只显示一次！）

### 2. 获取 Zone ID

1. 在 Cloudflare 控制台，选择你的域名（例如：`onefly.top`）
2. 在页面右侧的 **API** 部分可以找到 **Zone ID**
3. 复制 Zone ID

### 3. 获取规则 ID（可选）

如果您想更新现有的重定向规则而不是创建新规则：

1. 在 Cloudflare 控制台，进入你的域名
2. 左侧菜单选择 **规则** → **重定向规则**
3. 找到你想要自动更新的规则
4. 可以通过浏览器开发者工具查看规则 ID（或使用 API 获取）

> **提示**：如果不填写 `rule_id`，脚本会创建新的重定向规则

### 4. 配置文件设置

1. 复制模板文件：
   ```bash
   copy cloudflare_config.json.template cloudflare_config.json
   ```

2. 编辑 `cloudflare_config.json`，填入您的配置：

```json
{
  "api_token": "YOUR_CLOUDFLARE_API_TOKEN",
  "zone_id": "YOUR_ZONE_ID",
  "rule_id": "",
  "source_pattern": "http.host eq \"onefly.top\""
}
```

**字段说明**：

| 字段 | 说明 | 示例 |
|------|------|------|
| `api_token` | Cloudflare API Token | `v4KJH...xyz` |
| `zone_id` | Cloudflare Zone ID | `a1b2c3d4...` |
| `rule_id` | 规则 ID（可选） | 留空或填写规则 ID |
| `source_pattern` | 源 URL 匹配模式 | `http.host eq "onefly.top"` |

**`source_pattern` 示例**：

```
# 匹配特定域名
http.host eq "onefly.top"

# 匹配特定路径
http.host eq "onefly.top" and http.request.uri.path eq "/join"

# 匹配多个条件
(http.host eq "onefly.top" or http.host eq "www.onefly.top")
```

## 使用方法

### 方式一：交互式运行

```bash
python domain_monitor.py
```

运行后会询问是否启用 Cloudflare 自动更新：
```
是否启用 Cloudflare 自动更新？(y/N): y
```

### 方式二：直接测试 Cloudflare 连接

```bash
python cloudflare_updater.py
```

这将：
1. 列出当前的所有重定向规则
2. 允许您测试更新规则

## 工作流程

1. **域名监控**：脚本定期检查 Notion 页面
2. **检测变化**：发现域名从 `https://www.firgrouxywebb.com/join/` 变更为新域名
3. **自动更新**：调用 Cloudflare API 更新 301 重定向规则
4. **记录日志**：所有操作记录在 `domain_monitor.log` 和 `domain_history.json`

## 验证配置

确认配置正确的方法：

```bash
# 测试 Cloudflare API 连接
python cloudflare_updater.py

# 单次检查（启用 Cloudflare）
python domain_monitor.py
# 选择：启用 Cloudflare (y)
# 选择：单次检查 (1)
```

查看日志：
```
✅ Cloudflare 自动更新已启用
正在更新 Cloudflare 重定向规则...
✅ Cloudflare 重定向规则已更新: https://www.newdomain.com/join/
```

## 故障排除

### 错误：配置文件不存在

```
❌ Cloudflare 配置文件不存在
```

**解决**：复制并配置 `cloudflare_config.json`

### 错误：API Token 无效

```
❌ Cloudflare API 错误: Invalid API Token
```

**解决**：
1. 检查 API Token 是否正确
2. 确认 Token 有足够的权限
3. Token 是否已过期

### 错误：Zone ID 无效

```
❌ Cloudflare API 错误: Zone not found
```

**解决**：检查 Zone ID 是否正确

### 警告：规则未找到

如果填写了 `rule_id` 但找不到规则，脚本会尝试创建新规则。

## 安全建议

1. **不要提交** `cloudflare_config.json` 到版本控制
2. **定期更换** API Token
3. **使用最小权限**原则配置 Token
4. **备份现有规则**再进行自动化配置

## 高级配置

### 配置通知

您可以修改 `domain_monitor.py` 添加通知功能（如邮件、钉钉、Slack等），在 `_update_cloudflare` 方法中添加通知代码。

###自动运行

使用 Windows 任务计划程序，设置脚本开机自启，并启用 Cloudflare 自动更新：

```powershell
python domain_monitor.py
# 在交互界面选择：
# 启用 Cloudflare: y
# 选择模式: 2 (持续监控)
```

## 完整示例

假设您的配置如下：
- 源域名：`onefly.top`
- Cloudflare Zone：`onefly.top`
- 当前重定向：`https://www.firgrouxywebb.com/join/`

当脚本检测到域名变更为 `https://www.newdomain.com/join/` 时：

1. 日志输出：
   ```
   2026-01-19 16:00:00 - WARNING - ⚠️ 域名发生变化!
   2026-01-19 16:00:00 - WARNING - 旧域名: https://www.firgrouxywebb.com/join/
   2026-01-19 16:00:00 - WARNING - 新域名: https://www.newdomain.com/join/
   2026-01-19 16:00:01 - INFO - 正在更新 Cloudflare 重定向规则...
   2026-01-19 16:00:02 - INFO - ✅ Cloudflare 重定向规则已更新
   ```

2. Cloudflare 规则更新：
   - 来源：`onefly.top`（所有请求）
   - 目标：`https://www.newdomain.com/join/`
   - 状态码：301（永久重定向）

3. 用户访问效果：
   - 用户访问 `http://onefly.top` 或 `https://onefly.top`
   - 自动 301 重定向到 `https://www.newdomain.com/join/`

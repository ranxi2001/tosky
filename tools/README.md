# 域名监控脚本

用于监听 Notion 页面中官方域名的切换变化。

## 功能特性

- 🔍 **自动提取域名**: 从 Notion 页面自动提取域名 URL
- 📊 **变化监控**: 检测域名变化并记录历史
- 🚀 **Cloudflare 自动更新**: 检测到域名变化时自动更新 Cloudflare 301 重定向规则（可选）
- 💾 **持久化存储**: 所有变化记录保存在 `domain_history.json`
- 📝 **日志记录**: 详细的运行日志保存在 `domain_monitor.log`
- ⏰ **定时检查**: 支持自定义检查间隔
- 📋 **三种运行模式**:
  - 单次检查
  - 持续监控
  - 查看历史记录

## 安装依赖

```bash
pip install requests
```

## 使用方法

### 基本使用

```bash
python domain_monitor.py
```

运行后会出现交互式菜单:

```
请选择运行模式:
1. 单次检查 - 立即检查一次当前域名
2. 持续监控 - 定期检查域名变化
3. 查看历史记录
```

### 模式说明

#### 1. 单次检查模式

- 立即访问 Notion 页面
- 提取当前域名
- 显示结果并退出
- 适合快速查看当前域名

#### 2. 持续监控模式

- 按设定间隔持续检查
- 自动检测域名变化
- 发现变化时会有警告提示
- 按 `Ctrl+C` 停止监控
- 适合长期监控域名变化

#### 3. 查看历史记录

- 显示所有域名变化历史
- 包括时间、域名和变化类型
- 无需访问网络

## 配置说明

### 检查间隔

默认检查间隔为 **300 秒（5 分钟）**，可以在运行时自定义:

```
请输入检查间隔（秒，默认300秒/5分钟，直接回车使用默认值）: 60
```

### Notion 页面 URL

当前监控的 Notion 页面:
```
https://conscious-meerkat-b7e.notion.site/APK-www-firgrouxywebb-com-join-df0b826aa4b840fea1aa4f351529afd1
```

如需修改，请编辑脚本中的 `NOTION_URL` 变量。

### 预期域名格式

脚本会尝试提取以下格式的域名:
- `www.xxx.com/join/`
- `https://www.xxx.com/join/`

## 输出文件

### domain_history.json

JSON 格式的历史记录文件，示例:

```json
[
  {
    "timestamp": "2026-01-19T15:45:30.123456",
    "domain": "https://www.firgrouxywebb.com/join/",
    "change_type": "首次检测"
  },
  {
    "timestamp": "2026-01-20T10:30:15.654321",
    "domain": "https://www.newdomain.com/join/",
    "change_type": "域名从 https://www.firgrouxywebb.com/join/ 变更"
  }
]
```

### domain_monitor.log

文本格式的运行日志，包含所有检查活动和错误信息。

## 工作原理

1. **访问 Notion 页面**: 使用模拟浏览器的请求头访问页面
2. **提取域名**: 使用多个正则表达式匹配域名
3. **规范化处理**: 确保域名格式统一（https:// 前缀，/join/ 后缀）
4. **变化检测**: 对比当前域名与上次检查的域名
5. **记录保存**: 将所有变化保存到历史文件

## 示例输出

### 首次检测

```
2026-01-19 15:45:30 - INFO - 开始监控域名变化...
2026-01-19 15:45:30 - INFO - 正在访问 Notion 页面...
2026-01-19 15:45:31 - INFO - 提取到域名: https://www.firgrouxywebb.com/join/
2026-01-19 15:45:31 - INFO - 首次检测到域名: https://www.firgrouxywebb.com/join/
```

### 检测到变化

```
2026-01-20 10:30:15 - WARNING - ⚠️ 域名发生变化!
2026-01-20 10:30:15 - WARNING - 旧域名: https://www.firgrouxywebb.com/join/
2026-01-20 10:30:15 - WARNING - 新域名: https://www.newdomain.com/join/
```

## 故障排除

### 无法提取域名

- 检查网络连接
- 确认 Notion 页面可访问
- 查看 `domain_monitor.log` 了解详细错误信息

### 请求超时

- 增加超时时间（修改脚本中的 `timeout=30` 参数）
- 检查网络稳定性

### 历史记录损坏

- 删除 `domain_history.json` 文件
- 重新运行脚本将创建新的历史记录

## Cloudflare 自动更新（可选）

### 功能说明

当启用此功能后，脚本检测到域名变化时会自动调用 Cloudflare API 更新 301 重定向规则。

**工作原理**：
- 从 Notion 页面提取**基础域名**（如 `https://www.firgrouxywebb.com`）
- 自动拼接**固定后缀** `/join/88596413`
- 更新 Cloudflare 重定向规则为完整 URL（如 `https://www.firgrouxywebb.com/join/88596413`）

**应用场景**：
- 您在 Cloudflare 托管了一个域名（如 `onefly.top`）
- 当官方域名变化时（只有主域名部分变化，路径固定）
- 自动将访问重定向到最新域名 + 固定后缀
- 无需手动登录 Cloudflare 更改规则

**示例**：
```
Notion 显示: www-newdomain-com-join
提取基础域名: https://www.newdomain.com
拼接后缀: /join/88596413
最终重定向: https://www.newdomain.com/join/88596413
```

### 快速配置

1. **运行配置助手**：
   ```bash
   双击 setup_cloudflare.bat
   ```
   
2. **按提示输入**：
   - Cloudflare API Token
   - Zone ID
   - 源域名匹配模式

3. **测试配置**：
   ```bash
   python cloudflare_updater.py
   ```

4. **启用监控**：
   ```bash
   python domain_monitor.py
   # 选择：启用 Cloudflare (y)
   # 选择：持续监控 (2)
   ```

### 详细配置

完整配置步骤请查看：[CLOUDFLARE_SETUP.md](CLOUDFLARE_SETUP.md)

包含内容：
- 如何获取 API Token
- 如何获取 Zone ID
- 匹配模式语法
- 故障排除
- 完整示例

## 高级用法

### 在后台运行（Windows）

使用 PowerShell:

```powershell
Start-Process python -ArgumentList "domain_monitor.py" -WindowStyle Hidden
```

### 定时任务（Windows 任务计划程序）

1. 打开任务计划程序
2. 创建基本任务
3. 触发器设置为系统启动时
4. 操作选择启动程序: `python.exe`
5. 参数: `C:\Users\ranxi\Desktop\OKX注册\tosky\tools\domain_monitor.py`

## 注意事项

- 确保有稳定的网络连接
- 不要设置过短的检查间隔（建议 ≥ 60 秒）
- 定期查看日志文件，避免磁盘空间占用过多
- Notion 页面可能需要登录或有访问限制

## 更新日志

### v1.0.0 (2026-01-19)
- ✨ 初始版本
- ✨ 支持从 Notion 页面提取域名
- ✨ 支持域名变化监控
- ✨ 支持历史记录保存和查看
- ✨ 支持三种运行模式

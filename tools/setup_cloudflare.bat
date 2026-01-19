@echo off
chcp 65001 >nul
title Cloudflare 配置助手
cd /d "%~dp0"

echo ================================================================================
echo Cloudflare 配置助手
echo ================================================================================
echo.
echo 此脚本将帮助您创建 Cloudflare 配置文件
echo.

REM 检查模板文件是否存在
if not exist "cloudflare_config.json.template" (
    echo 错误：找不到配置模板文件 cloudflare_config.json.template
    pause
    exit /b 1
)

REM 检查配置文件是否已存在
if exist "cloudflare_config.json" (
    echo 警告：cloudflare_config.json 已存在！
    echo.
    set /p overwrite="是否要覆盖现有配置？(y/N): "
    if /i not "%overwrite%"=="y" (
        echo 已取消配置
        pause
        exit /b 0
    )
)

echo.
echo ================================================================================
echo 请准备以下信息：
echo ================================================================================
echo 1. Cloudflare API Token （具有编辑规则权限）
echo 2. Zone ID （在 Cloudflare 控制台域名页面右侧可找到）
echo 3. 源域名匹配模式 （例如：http.host eq "onefly.top"）
echo.
echo 详细获取方法请查看 CLOUDFLARE_SETUP.md 文档
echo ================================================================================
echo.
pause
echo.

REM 输入配置信息
set /p api_token="请输入 Cloudflare API Token: "
set /p zone_id="请输入 Zone ID: "
set /p source_pattern="请输入源域名匹配模式 (例如 http.host eq \"onefly.top\"): "
set /p rule_id="请输入规则 ID (可选，直接回车跳过): "

REM 创建配置文件
echo {> cloudflare_config.json
echo   "api_token": "%api_token%",>> cloudflare_config.json
echo   "zone_id": "%zone_id%",>> cloudflare_config.json
echo   "rule_id": "%rule_id%",>> cloudflare_config.json
echo   "source_pattern": "%source_pattern%">> cloudflare_config.json
echo }>> cloudflare_config.json

echo.
echo ================================================================================
echo ✅ 配置文件已创建：cloudflare_config.json
echo ================================================================================
echo.
echo 下一步：
echo 1. 运行 python cloudflare_updater.py 测试连接
echo 2. 或运行 python domain_monitor.py 启动监控（选择启用 Cloudflare）
echo.
pause

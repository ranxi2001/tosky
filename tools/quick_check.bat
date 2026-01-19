@echo off
chcp 65001 >nul
title 快速检查当前域名
cd /d "%~dp0"
echo 正在检查当前域名...
echo.
python -c "from domain_monitor import DomainMonitor; m = DomainMonitor('https://conscious-meerkat-b7e.notion.site/APK-www-firgrouxywebb-com-join-df0b826aa4b840fea1aa4f351529afd1'); m.check_domain_change(); print('\n当前域名:', m.get_current_domain())"
echo.
pause

@echo off
chcp 65001 >nul
title 域名监控脚本
cd /d "%~dp0"
python domain_monitor.py
pause

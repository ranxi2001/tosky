#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
快速配置 Cloudflare - 验证 Token 并获取 Zone ID
"""

import requests
import json

# API Token
API_TOKEN = "67tkCp51nMje4C6hnGg8QBMfFnI6pty8xopAdo5_"

headers = {
    "Authorization": f"Bearer {API_TOKEN}",
    "Content-Type": "application/json"
}

print("="*80)
print("Cloudflare API 配置助手")
print("="*80)
print(f"\n🔑 API Token: {API_TOKEN[:10]}...{API_TOKEN[-10:]}")

# 1. 获取 Zone ID（同时验证 Token 有效性）
print("\n📡 正在获取 onefly.top 的 Zone 信息...")
try:
    response = requests.get(
        "https://api.cloudflare.com/client/v4/zones?name=onefly.top",
        headers=headers,
        timeout=10
    )
    result = response.json()
    
    if result.get("success") and result.get("result"):
        zone = result["result"][0]
        zone_id = zone["id"]
        zone_name = zone["name"]
        zone_status = zone.get('status', 'unknown')
        
        print(f"✅ API Token 有效！（通过 Zone 查询验证）")
        print(f"✅ 找到 Zone: {zone_name}")
        print(f"   Zone ID: {zone_id}")
        print(f"   状态: {zone_status}")
    else:
        print("❌ API Token 无效或没有权限访问该 Zone")
        errors = result.get('errors', [])
        if errors:
            for error in errors:
                print(f"   错误码: {error.get('code')}")
                print(f"   错误信息: {error.get('message')}")
        else:
            print("   未找到 onefly.top Zone")
        print("\n💡 请检查:")
        print("  1. API Token 是否有效")
        print("  2. Token 是否有访问该 Zone 的权限")
        print("  3. Zone 名称是否正确")
        exit(1)
except Exception as e:
    print(f"❌ 请求失败: {e}")
    print("\n💡 可能的原因:")
    print("  1. 网络连接问题")
    print("  2. API Token 格式错误")
    print("  3. Cloudflare API 不可用")
    import traceback
    traceback.print_exc()
    exit(1)

# 2. 创建配置文件
print("\n💾 创建配置文件...")
config = {
    "api_token": API_TOKEN,
    "zone_id": zone_id,
    "rule_id": "",
    "source_pattern": 'http.host eq "onefly.top"',
    "redirect_suffix": "/join/88596413"
}

config_file = "cloudflare_config.json"
with open(config_file, 'w', encoding='utf-8') as f:
    json.dump(config, f, ensure_ascii=False, indent=2)

print(f"✅ 配置文件已创建: {config_file}")

# 4. 提取当前域名（从 Notion URL）
print("\n🔍 提取当前域名...")
NOTION_URL = "https://conscious-meerkat-b7e.notion.site/APK-www-firgrouxywebb-com-join-df0b826aa4b840fea1aa4f351529afd1"

try:
    # 从 Notion URL 标题提取域名
    import re
    title_match = re.search(r'APK-([a-zA-Z0-9-]+)-df0b826', NOTION_URL)
    current_domain = None
    
    if title_match:
        domain_slug = title_match.group(1)
        parts = domain_slug.split('-')
        
        # 查找 'join' 的位置并提取基础域名
        if 'join' in parts:
            join_index = parts.index('join')
            domain_parts = parts[:join_index]
        else:
            domain_parts = parts
        
        # 重组域名
        if len(domain_parts) >= 2:
            tld_candidates = ['com', 'net', 'org', 'io', 'co']
            for i, part in enumerate(domain_parts):
                if part in tld_candidates:
                    domain_str = '.'.join(domain_parts[:i]) + '.' + part
                    current_domain = f"https://{domain_str}"
                    break
        
        if not current_domain:
            domain_str = domain_slug.replace('-join', '').replace('-', '.')
            current_domain = f"https://{domain_str}"
    
    if current_domain:
        full_redirect_url = current_domain + "/join/88596413"
        print(f"✅ 当前域名: {current_domain}")
        print(f"✅ 完整重定向 URL: {full_redirect_url}")
    else:
        print("⚠️ 未能从 Notion URL 提取域名")
        full_redirect_url = "https://www.firgrouxywebb.com/join/88596413 (示例)"
        
except Exception as e:
    print(f"⚠️ 提取域名失败: {e}")
    full_redirect_url = "https://www.firgrouxywebb.com/join/88596413 (示例)"

# 5. 显示配置摘要
print("\n" + "="*80)
print("📋 配置摘要")
print("="*80)
print(f"API Token: {API_TOKEN[:20]}...{API_TOKEN[-10:]}")
print(f"Zone ID:   {zone_id}")
print(f"Zone Name: {zone_name}")
print(f"Zone 状态: {zone_status}")
print(f"匹配模式:  http.host eq \"onefly.top\"")
print(f"重定向后缀: /join/88596413")
print(f"当前重定向: {full_redirect_url}")
print("="*80)

print("\n🎉 配置完成！下一步:")
print("   1. 测试连接: python cloudflare_updater.py")
print("   2. 启动监控: python domain_monitor.py")
print("\n提示: 域名监控时选择 'y' 启用 Cloudflare 自动更新")
print("     脚本将提取基础域名(如 https://www.example.com)")
print("     并自动拼接后缀 /join/88596413 后更新到 Cloudflare")


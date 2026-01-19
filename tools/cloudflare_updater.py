#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Cloudflare 301 重定向自动更新脚本
当检测到域名变化时，自动更新 Cloudflare 的重定向规则
"""

import requests
import json
import logging
from typing import Optional, Dict, Any
from pathlib import Path

logger = logging.getLogger(__name__)


class CloudflareUpdater:
    """Cloudflare 重定向规则更新器"""
    
    def __init__(self, api_token: str, zone_id: str, rule_id: Optional[str] = None):
        """
        初始化 Cloudflare 更新器
        
        Args:
            api_token: Cloudflare API Token（需要有编辑规则权限）
            zone_id: Cloudflare Zone ID
            rule_id: 重定向规则 ID（可选，如果要更新现有规则）
        """
        self.api_token = api_token
        self.zone_id = zone_id
        self.rule_id = rule_id
        self.base_url = "https://api.cloudflare.com/client/v4"
        self.headers = {
            "Authorization": f"Bearer {api_token}",
            "Content-Type": "application/json"
        }
    
    def _make_request(self, method: str, endpoint: str, data: Optional[Dict] = None) -> Dict[str, Any]:
        """
        发送 API 请求
        
        Args:
            method: HTTP 方法（GET, POST, PUT, DELETE）
            endpoint: API 端点
            data: 请求数据
            
        Returns:
            API 响应数据
        """
        url = f"{self.base_url}{endpoint}"
        
        try:
            if method == "GET":
                response = requests.get(url, headers=self.headers, timeout=30)
            elif method == "POST":
                response = requests.post(url, headers=self.headers, json=data, timeout=30)
            elif method == "PUT":
                response = requests.put(url, headers=self.headers, json=data, timeout=30)
            elif method == "DELETE":
                response = requests.delete(url, headers=self.headers, timeout=30)
            else:
                raise ValueError(f"不支持的 HTTP 方法: {method}")
            
            response.raise_for_status()
            result = response.json()
            
            if not result.get("success"):
                errors = result.get("errors", [])
                error_msg = "; ".join([e.get("message", str(e)) for e in errors])
                raise Exception(f"Cloudflare API 错误: {error_msg}")
            
            return result
            
        except requests.RequestException as e:
            logger.error(f"API 请求失败: {e}")
            raise
        except Exception as e:
            logger.error(f"处理响应失败: {e}")
            raise
    
    def list_redirect_rules(self) -> list:
        """
        列出所有重定向规则
        
        Returns:
            重定向规则列表
        """
        endpoint = f"/zones/{self.zone_id}/rulesets"
        result = self._make_request("GET", endpoint)
        
        # 查找 http_request_redirect 类型的规则集
        redirect_rulesets = []
        for ruleset in result.get("result", []):
            if ruleset.get("phase") == "http_request_redirect":
                redirect_rulesets.append(ruleset)
        
        return redirect_rulesets
    
    def create_redirect_rule(self, source_url_pattern: str, target_url: str, 
                            rule_name: str = "Auto Redirect Rule") -> Dict[str, Any]:
        """
        创建 301 重定向规则
        
        Args:
            source_url_pattern: 源 URL 模式（例如：'http.host eq "onefly.top"'）
            target_url: 目标 URL
            rule_name: 规则名称
            
        Returns:
            创建的规则信息
        """
        # 首先获取或创建重定向规则集
        endpoint = f"/zones/{self.zone_id}/rulesets"
        result = self._make_request("GET", endpoint)
        
        redirect_ruleset = None
        for ruleset in result.get("result", []):
            if ruleset.get("phase") == "http_request_redirect":
                redirect_ruleset = ruleset
                break
        
        # 构建重定向规则
        rule_data = {
            "expression": source_url_pattern,
            "action": "redirect",
            "action_parameters": {
                "from_value": {
                    "status_code": 301,
                    "target_url": {
                        "value": target_url
                    },
                    "preserve_query_string": False
                }
            },
            "description": rule_name,
            "enabled": True
        }
        
        if redirect_ruleset:
            # 更新现有规则集
            ruleset_id = redirect_ruleset["id"]
            endpoint = f"/zones/{self.zone_id}/rulesets/{ruleset_id}/rules"
            result = self._make_request("POST", endpoint, rule_data)
        else:
            # 创建新规则集
            ruleset_data = {
                "name": "redirect rules",
                "kind": "zone",
                "phase": "http_request_redirect",
                "rules": [rule_data]
            }
            endpoint = f"/zones/{self.zone_id}/rulesets"
            result = self._make_request("POST", endpoint, ruleset_data)
        
        logger.info(f"成功创建重定向规则: {rule_name}")
        return result.get("result", {})
    
    def update_redirect_rule(self, rule_id: str, target_url: str, 
                            source_url_pattern: Optional[str] = None) -> Dict[str, Any]:
        """
        更新现有的 301 重定向规则
        
        Args:
            rule_id: 规则 ID
            target_url: 新的目标 URL
            source_url_pattern: 源 URL 模式（可选）
            
        Returns:
            更新后的规则信息
        """
        # 获取重定向规则集
        rulesets = self.list_redirect_rules()
        if not rulesets:
            raise Exception("未找到重定向规则集")
        
        ruleset_id = rulesets[0]["id"]
        
        # 获取现有规则
        endpoint = f"/zones/{self.zone_id}/rulesets/{ruleset_id}"
        result = self._make_request("GET", endpoint)
        
        # 查找并更新规则
        rules = result.get("result", {}).get("rules", [])
        rule_found = False
        
        for rule in rules:
            if rule.get("id") == rule_id:
                rule["action_parameters"]["from_value"]["target_url"]["value"] = target_url
                if source_url_pattern:
                    rule["expression"] = source_url_pattern
                rule_found = True
                break
        
        if not rule_found:
            raise Exception(f"未找到规则 ID: {rule_id}")
        
        # 更新整个规则集
        update_data = {
            "rules": rules
        }
        
        endpoint = f"/zones/{self.zone_id}/rulesets/{ruleset_id}"
        result = self._make_request("PUT", endpoint, update_data)
        
        logger.info(f"成功更新重定向规则: {rule_id} -> {target_url}")
        return result.get("result", {})
    
    def update_or_create_redirect(self, source_pattern: str, target_url: str, 
                                  rule_name: str = "OKX Domain Redirect") -> Dict[str, Any]:
        """
        更新或创建重定向规则（智能判断）
        
        Args:
            source_pattern: 源 URL 模式
            target_url: 目标 URL
            rule_name: 规则名称
            
        Returns:
            规则信息
        """
        try:
            if self.rule_id:
                # 如果指定了 rule_id，尝试更新
                return self.update_redirect_rule(self.rule_id, target_url, source_pattern)
            else:
                # 否则创建新规则
                return self.create_redirect_rule(source_pattern, target_url, rule_name)
        except Exception as e:
            logger.error(f"更新/创建重定向规则失败: {e}")
            raise


def load_config(config_file: str = "cloudflare_config.json") -> Dict[str, str]:
    """
    从配置文件加载 Cloudflare 配置
    
    Args:
        config_file: 配置文件路径
        
    Returns:
        配置字典
    """
    config_path = Path(__file__).parent / config_file
    
    if not config_path.exists():
        raise FileNotFoundError(
            f"配置文件不存在: {config_path}\n"
            f"请创建配置文件并填入以下信息：\n"
            f"{{\n"
            f'  "api_token": "your_cloudflare_api_token",\n'
            f'  "zone_id": "your_zone_id",\n'
            f'  "rule_id": "your_rule_id (optional)",\n'
            f'  "source_pattern": "http.host eq \\"onefly.top\\""\n'
            f"}}"
        )
    
    with open(config_path, 'r', encoding='utf-8') as f:
        return json.load(f)


def main():
    """主函数 - 测试用"""
    import sys
    
    # 配置日志
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s - %(levelname)s - %(message)s'
    )
    
    try:
        # 加载配置
        config = load_config()
        
        # 创建更新器
        updater = CloudflareUpdater(
            api_token=config["api_token"],
            zone_id=config["zone_id"],
            rule_id=config.get("rule_id")
        )
        
        # 测试：列出现有规则
        print("\n当前的重定向规则集:")
        rulesets = updater.list_redirect_rules()
        for ruleset in rulesets:
            print(f"  - {ruleset.get('name')}: {ruleset.get('id')}")
            for rule in ruleset.get("rules", []):
                print(f"    • {rule.get('description')}: {rule.get('action_parameters', {}).get('from_value', {}).get('target_url', {}).get('value')}")
        
        # 询问是否更新
        print("\n是否要测试更新重定向规则？")
        test_url = input("请输入测试目标 URL（直接回车跳过）: ").strip()
        
        if test_url:
            result = updater.update_or_create_redirect(
                source_pattern=config["source_pattern"],
                target_url=test_url
            )
            print(f"\n✅ 成功更新重定向规则到: {test_url}")
        
    except FileNotFoundError as e:
        print(f"❌ {e}")
        sys.exit(1)
    except Exception as e:
        print(f"❌ 错误: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
域名监控脚本
用于监听 Notion 页面中的官方域名变化
"""

import requests
import re
import time
import json
from datetime import datetime
from pathlib import Path
from typing import Optional, Dict, List
import logging
import sys

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('domain_monitor.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)


class DomainMonitor:
    """域名监控器"""
    
    def __init__(self, notion_url: str, check_interval: int = 300, cloudflare_enabled: bool = False):
        """
        初始化域名监控器
        
        Args:
            notion_url: Notion 页面 URL
            check_interval: 检查间隔（秒），默认 5 分钟
            cloudflare_enabled: 是否启用 Cloudflare 自动更新
        """
        self.notion_url = notion_url
        self.check_interval = check_interval
        self.history_file = Path(__file__).parent / 'domain_history.json'
        self.current_domain: Optional[str] = None
        self.history: List[Dict] = self._load_history()
        self.cloudflare_enabled = cloudflare_enabled
        self.cloudflare_updater = None
        
        # 如果启用 Cloudflare，加载配置并初始化更新器
        if self.cloudflare_enabled:
            self._init_cloudflare()
        
    def _load_history(self) -> List[Dict]:
        """加载历史记录"""
        if self.history_file.exists():
            try:
                with open(self.history_file, 'r', encoding='utf-8') as f:
                    return json.load(f)
            except Exception as e:
                logger.error(f"加载历史记录失败: {e}")
                return []
        return []
    
    def _save_history(self):
        """保存历史记录"""
        try:
            with open(self.history_file, 'w', encoding='utf-8') as f:
                json.dump(self.history, f, ensure_ascii=False, indent=2)
            logger.info("历史记录已保存")
        except Exception as e:
            logger.error(f"保存历史记录失败: {e}")
    
    def _init_cloudflare(self):
        """初始化 Cloudflare 更新器"""
        try:
            # 尝试导入 cloudflare_updater 模块
            from cloudflare_updater import CloudflareUpdater, load_config
            
            # 加载配置
            config = load_config()
            
            # 创建更新器
            self.cloudflare_updater = CloudflareUpdater(
                api_token=config["api_token"],
                zone_id=config["zone_id"],
                rule_id=config.get("rule_id")
            )
            
            self.cloudflare_config = config
            logger.info("✅ Cloudflare 自动更新已启用")
            
        except FileNotFoundError as e:
            logger.error(f"❌ Cloudflare 配置文件不存在: {e}")
            logger.error("请复制 cloudflare_config.json.template 为 cloudflare_config.json 并填入配置")
            self.cloudflare_enabled = False
        except ImportError as e:
            logger.error(f"❌ 无法导入 cloudflare_updater 模块: {e}")
            self.cloudflare_enabled = False
        except Exception as e:
            logger.error(f"❌ 初始化 Cloudflare 更新器失败: {e}")
            self.cloudflare_enabled = False
    
    def extract_domain_from_notion(self) -> Optional[str]:
        """
        从 Notion 页面提取基础域名（不包含 /join/ 路径）
        
        Returns:
            提取到的基础域名（如 https://www.firgrouxywebb.com），如果失败则返回 None
        """
        try:
            # 添加请求头模拟浏览器
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            }
            
            logger.info(f"正在访问 Notion 页面: {self.notion_url}")
            response = requests.get(self.notion_url, headers=headers, timeout=30)
            response.raise_for_status()
            
            content = response.text
            
            # 尝试多种正则表达式匹配域名（只提取基础域名部分）
            patterns = [
                # 匹配 www.xxx.com 格式（在 /join 之前）
                r'(https?://)?(?:www\.)?([a-zA-Z0-9-]+\.com)(?:/join)?',
                # 匹配完整 URL 但只取域名部分
                r'(https?://(?:www\.)?[a-zA-Z0-9-]+\.com)(?:/join)?',
                # 匹配文本中的域名
                r'(?:域名|网址|链接|URL|Domain)[:：\s]*([a-zA-Z0-9-]+\.com)',
            ]
            
            for pattern in patterns:
                matches = re.findall(pattern, content, re.IGNORECASE)
                if matches:
                    # 提取并规范化域名（只保留基础域名）
                    for match in matches:
                        if isinstance(match, tuple):
                            domain = match[-1] if match[-1] else match[0]
                        else:
                            domain = match
                        
                        # 清理域名：移除 /join 及后续路径
                        domain = domain.split('/join')[0]
                        domain = domain.rstrip('/')
                        
                        # 确保域名格式正确（添加 https://）
                        if not domain.startswith('http'):
                            domain = 'https://' + domain
                        
                        logger.info(f"提取到基础域名: {domain}")
                        return domain
            
            # 如果没有从内容中提取到，尝试从 URL 标题提取
            # Notion URL 格式: APK-www-firgrouxywebb-com-join-df0b826...
            title_match = re.search(r'APK-([a-zA-Z0-9-]+)-df0b826', self.notion_url)
            if title_match:
                # 提取域名部分并转换格式
                # 例如: www-firgrouxywebb-com-join -> www.firgrouxywebb.com
                domain_slug = title_match.group(1)
                
                # 处理域名格式
                # 假设格式为: www-domain-com-join 或 domain-com-join
                parts = domain_slug.split('-')
                
                # 查找 'join' 的位置（如果有）
                if 'join' in parts:
                    join_index = parts.index('join')
                    # join 之前的部分是域名
                    domain_parts = parts[:join_index]
                else:
                    domain_parts = parts
                
                # 重组域名（将 - 替换为 .）
                if len(domain_parts) >= 2:
                    # 找到 com/net/org 等顶级域名
                    tld_candidates = ['com', 'net', 'org', 'io', 'co']
                    domain_str = None
                    
                    for i, part in enumerate(domain_parts):
                        if part in tld_candidates:
                            # 重组: 将顶级域名前的部分用 . 连接
                            domain_str = '.'.join(domain_parts[:i]) + '.' + part
                            break
                    
                    if domain_str:
                        domain = f"https://{domain_str}"
                        logger.info(f"从 URL 标题提取到基础域名: {domain}")
                        return domain
                
                # 如果上述方法失败，尝试简单替换（移除 join 部分）
                domain_str = domain_slug.replace('-join', '').replace('-', '.')
                domain = f"https://{domain_str}"
                logger.info(f"从 URL 标题提取到基础域名（简单模式）: {domain}")
                return domain
            
            logger.warning("未能从 Notion 页面提取到域名")
            return None
            
        except requests.RequestException as e:
            logger.error(f"请求 Notion 页面失败: {e}")
            return None
        except Exception as e:
            logger.error(f"提取域名时发生错误: {e}")
            return None
    
    def check_domain_change(self) -> bool:
        """
        检查域名是否发生变化
        
        Returns:
            如果域名发生变化返回 True，否则返回 False
        """
        new_domain = self.extract_domain_from_notion()
        
        if new_domain is None:
            logger.warning("本次检查未能获取域名")
            return False
        
        # 首次检查
        if self.current_domain is None:
            self.current_domain = new_domain
            self._record_change(new_domain, "首次检测")
            logger.info(f"首次检测到基础域名: {new_domain}")
            # 首次检测也尝试更新 Cloudflare
            if self.cloudflare_enabled:
                self._update_cloudflare(new_domain)
            return True
        
        # 检查是否发生变化
        if new_domain != self.current_domain:
            old_domain = self.current_domain
            self.current_domain = new_domain
            self._record_change(new_domain, f"域名从 {old_domain} 变更")
            logger.warning(f"⚠️ 基础域名发生变化!")
            logger.warning(f"旧域名: {old_domain}")
            logger.warning(f"新域名: {new_domain}")
            
            # 自动更新 Cloudflare
            if self.cloudflare_enabled:
                self._update_cloudflare(new_domain)
            
            return True
        
        logger.info(f"基础域名未变化: {new_domain}")
        return False
    
    def _update_cloudflare(self, base_domain: str):
        """更新 Cloudflare 重定向规则"""
        if not self.cloudflare_updater:
            logger.error("Cloudflare 更新器未初始化")
            return
        
        try:
            # 获取重定向后缀（默认为 /join/88596413）
            redirect_suffix = self.cloudflare_config.get("redirect_suffix", "/join/88596413")
            
            # 拼接完整的重定向 URL
            full_redirect_url = base_domain.rstrip('/') + redirect_suffix
            
            logger.info(f"正在更新 Cloudflare 重定向规则...")
            logger.info(f"基础域名: {base_domain}")
            logger.info(f"完整重定向 URL: {full_redirect_url}")
            
            result = self.cloudflare_updater.update_or_create_redirect(
                source_pattern=self.cloudflare_config["source_pattern"],
                target_url=full_redirect_url,
                rule_name="OKX Domain Auto Redirect"
            )
            
            logger.info(f"✅ Cloudflare 重定向规则已更新: {full_redirect_url}")
            
            # 记录到历史
            self._record_change(full_redirect_url, f"Cloudflare 301 重定向已更新")
            
        except Exception as e:
            logger.error(f"❌ 更新 Cloudflare 重定向规则失败: {e}")
            # 即使 Cloudflare 更新失败，也继续运行监控
    
    def _record_change(self, domain: str, change_type: str):
        """
        记录域名变化
        
        Args:
            domain: 域名
            change_type: 变化类型
        """
        record = {
            'timestamp': datetime.now().isoformat(),
            'domain': domain,
            'change_type': change_type
        }
        self.history.append(record)
        self._save_history()
    
    def get_current_domain(self) -> Optional[str]:
        """获取当前域名"""
        return self.current_domain
    
    def get_history(self) -> List[Dict]:
        """获取历史记录"""
        return self.history
    
    def print_history(self):
        """打印历史记录"""
        if not self.history:
            print("暂无历史记录")
            return
        
        print("\n" + "="*80)
        print("域名变化历史记录")
        print("="*80)
        for i, record in enumerate(self.history, 1):
            print(f"\n记录 {i}:")
            print(f"  时间: {record['timestamp']}")
            print(f"  域名: {record['domain']}")
            print(f"  类型: {record['change_type']}")
        print("="*80 + "\n")
    
    def run(self):
        """运行监控"""
        logger.info("开始监控域名变化...")
        logger.info(f"Notion 页面: {self.notion_url}")
        logger.info(f"检查间隔: {self.check_interval} 秒")
        
        try:
            while True:
                self.check_domain_change()
                logger.info(f"等待 {self.check_interval} 秒后进行下次检查...")
                time.sleep(self.check_interval)
        except KeyboardInterrupt:
            logger.info("\n监控已停止")
            self.print_history()


def main():
    """主函数"""
    # Notion 页面 URL
    NOTION_URL = "https://conscious-meerkat-b7e.notion.site/APK-www-firgrouxywebb-com-join-df0b826aa4b840fea1aa4f351529afd1"
    
    # 默认域名（从 URL 标题推断）
    DEFAULT_DOMAIN = "www.firgrouxywebb.com/join/"
    
    print("="*80)
    print("域名监控脚本 + Cloudflare 自动更新")
    print("="*80)
    print(f"监控 Notion 页面: {NOTION_URL}")
    print(f"预期域名: {DEFAULT_DOMAIN}")
    print("="*80)
    
    # 询问是否启用 Cloudflare 自动更新
    print("\n是否启用 Cloudflare 自动更新？")
    print("  - 如果启用，检测到域名变化时会自动更新 Cloudflare 的 301 重定向规则")
    print("  - 需要先配置 cloudflare_config.json 文件")
    cloudflare_choice = input("\n启用 Cloudflare 自动更新？(y/N): ").strip().lower()
    cloudflare_enabled = cloudflare_choice in ['y', 'yes', '是']
    
    # 询问用户选择模式
    print("\n请选择运行模式:")
    print("1. 单次检查 - 立即检查一次当前域名")
    print("2. 持续监控 - 定期检查域名变化")
    print("3. 查看历史记录")
    
    choice = input("\n请输入选项 (1/2/3): ").strip()
    
    # 创建监控器
    if choice == '3':
        # 只查看历史记录
        monitor = DomainMonitor(NOTION_URL, cloudflare_enabled=False)
        monitor.print_history()
        return
    
    # 询问检查间隔
    interval_input = input("\n请输入检查间隔（秒，默认300秒/5分钟，直接回车使用默认值）: ").strip()
    check_interval = int(interval_input) if interval_input.isdigit() else 300
    
    monitor = DomainMonitor(NOTION_URL, check_interval, cloudflare_enabled)
    
    if choice == '1':
        # 单次检查
        print("\n开始检查...")
        monitor.check_domain_change()
        current = monitor.get_current_domain()
        if current:
            print(f"\n当前域名: {current}")
        monitor.print_history()
    elif choice == '2':
        # 持续监控
        print(f"\n开始持续监控，每 {check_interval} 秒检查一次...")
        if cloudflare_enabled:
            print("✅ Cloudflare 自动更新已启用")
        print("按 Ctrl+C 停止监控\n")
        monitor.run()
    else:
        print("无效的选项，请重新运行脚本")


if __name__ == "__main__":
    main()

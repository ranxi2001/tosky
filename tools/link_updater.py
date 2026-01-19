#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
链接自动更新脚本
监控域名变化并自动更新 page.tsx 中的链接，然后提交 git 触发自动部署
"""

import json
import subprocess
import logging
import time
import re
import requests
from pathlib import Path
from datetime import datetime

# 配置日志
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('link_updater.log', encoding='utf-8'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

# 配置文件路径
CONFIG_PATH = Path(__file__).parent / 'link_config.json'


def load_config() -> dict:
    """加载配置文件"""
    with open(CONFIG_PATH, 'r', encoding='utf-8') as f:
        return json.load(f)


def save_config(config: dict):
    """保存配置文件"""
    with open(CONFIG_PATH, 'w', encoding='utf-8') as f:
        json.dump(config, f, ensure_ascii=False, indent=2)


class LinkUpdater:
    """链接自动更新器"""

    def __init__(self, check_interval: int = 300):
        """
        初始化链接更新器

        Args:
            check_interval: 检查间隔（秒）
        """
        self.config = load_config()
        self.files = [Path(f) for f in self.config['files']]
        self.check_interval = check_interval

    def extract_domain_from_notion(self) -> str:
        """
        从 Notion URL 标题提取官方域名
        URL 格式: APK-www-firgrouxywebb-com-join-df0b826...
        提取为: www.firgrouxywebb.com
        """
        try:
            notion_url = self.config['notion_url']

            # 从 URL 标题提取域名
            # 格式: APK-www-domainname-com-join-xxx
            match = re.search(r'APK-(www-[a-zA-Z0-9-]+-com)-join', notion_url)
            if match:
                # www-firgrouxywebb-com -> www.firgrouxywebb.com
                domain_slug = match.group(1)
                domain = domain_slug.replace('-', '.')
                logger.info(f"从 URL 标题提取到域名: {domain}")
                return f"https://{domain}"

            logger.warning("未能从 Notion URL 提取到域名")
            return None

        except Exception as e:
            logger.error(f"提取域名失败: {e}")
            return None

    def update_files(self, new_link: str) -> bool:
        """
        更新所有文件中的链接（精确替换）

        Args:
            new_link: 新的完整链接

        Returns:
            是否更新成功
        """
        try:
            old_link = self.config['current_link']
            updated_count = 0

            for file_path in self.files:
                if not file_path.exists():
                    logger.warning(f"文件不存在: {file_path}")
                    continue

                content = file_path.read_text(encoding='utf-8')

                if old_link not in content:
                    logger.info(f"文件中没有旧链接: {file_path.name}")
                    continue

                # 精确替换
                new_content = content.replace(old_link, new_link)
                file_path.write_text(new_content, encoding='utf-8')
                logger.info(f"已更新: {file_path}")
                updated_count += 1

            if updated_count > 0:
                logger.info(f"共更新 {updated_count} 个文件")
                logger.info(f"  旧链接: {old_link}")
                logger.info(f"  新链接: {new_link}")

                # 更新配置文件
                self.config['current_link'] = new_link
                self.config['last_updated'] = datetime.now().isoformat()
                save_config(self.config)

                return True
            else:
                logger.info("没有文件需要更新")
                return False

        except Exception as e:
            logger.error(f"更新文件失败: {e}")
            return False

    def git_commit_and_push(self, new_link: str) -> bool:
        """
        提交 git 并推送

        Args:
            new_link: 新链接（用于提交信息）

        Returns:
            是否成功
        """
        try:
            repo_path = Path("/home/tosky")

            # git add 所有文件和 config
            files_to_add = [str(f) for f in self.files] + [str(CONFIG_PATH)]
            subprocess.run(
                ['git', 'add'] + files_to_add,
                cwd=repo_path,
                capture_output=True,
                text=True,
                check=True
            )

            # git commit
            commit_msg = f"chore: 自动更新注册链接为 {new_link}"
            result = subprocess.run(
                ['git', 'commit', '-m', commit_msg],
                cwd=repo_path,
                capture_output=True,
                text=True
            )
            if result.returncode != 0:
                if 'nothing to commit' in result.stdout + result.stderr:
                    logger.info("没有需要提交的更改")
                    return True
                logger.error(f"git commit 失败: {result.stderr}")
                return False

            logger.info(f"git commit 成功: {commit_msg}")

            # git push
            result = subprocess.run(
                ['git', 'push'],
                cwd=repo_path,
                capture_output=True,
                text=True
            )
            if result.returncode != 0:
                logger.error(f"git push 失败: {result.stderr}")
                return False

            logger.info("git push 成功，部署将自动触发")
            return True

        except Exception as e:
            logger.error(f"git 操作失败: {e}")
            return False

    def check_and_update(self) -> bool:
        """
        检查域名变化并更新

        Returns:
            是否有更新
        """
        # 获取最新域名
        new_domain = self.extract_domain_from_notion()

        if not new_domain:
            logger.warning("无法获取新域名")
            return False

        # 构建完整链接
        invite_code = self.config['invite_code']
        new_link = f"{new_domain.rstrip('/')}/join/{invite_code}"

        # 检查是否需要更新
        current_link = self.config['current_link']
        if current_link == new_link:
            logger.info(f"链接未变化: {current_link}")
            return False

        logger.info(f"检测到链接变化:")
        logger.info(f"  当前: {current_link}")
        logger.info(f"  新的: {new_link}")

        # 更新所有文件
        if self.update_files(new_link):
            # 提交并推送
            if self.git_commit_and_push(new_link):
                logger.info("链接更新完成!")
                return True

        return False

    def run(self):
        """运行持续监控"""
        logger.info("=" * 60)
        logger.info("链接自动更新脚本启动")
        logger.info(f"当前链接: {self.config['current_link']}")
        logger.info(f"监控间隔: {self.check_interval} 秒")
        logger.info("=" * 60)

        try:
            while True:
                self.check_and_update()
                logger.info(f"等待 {self.check_interval} 秒后进行下次检查...")
                time.sleep(self.check_interval)
        except KeyboardInterrupt:
            logger.info("\n监控已停止")


def main():
    """主函数"""
    config = load_config()

    print("=" * 60)
    print("链接自动更新脚本")
    print("=" * 60)
    print(f"当前链接: {config['current_link']}")
    print(f"上次更新: {config['last_updated'] or '从未'}")
    print("=" * 60)

    print("\n请选择运行模式:")
    print("1. 单次检查并更新")
    print("2. 持续监控并自动更新")

    choice = input("\n请输入选项 (1/2): ").strip()

    interval_input = input("检查间隔（秒，默认300）: ").strip()
    check_interval = int(interval_input) if interval_input.isdigit() else 300

    updater = LinkUpdater(check_interval)

    if choice == '1':
        print("\n开始检查...")
        if updater.check_and_update():
            print("\n链接已更新并提交")
        else:
            print("\n无需更新或更新失败")
    elif choice == '2':
        print(f"\n开始持续监控...")
        print("按 Ctrl+C 停止\n")
        updater.run()
    else:
        print("无效选项")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""Retired: static HTML and URL-slug inference cannot track public Notion content."""

MESSAGE = (
    "Legacy Notion updater disabled. From the repository root use "
    "npm run sync:okx-referral -- --dry-run. See tools/README.md. "
    "No configuration, network, Git or Cloudflare operations were performed."
)

if __name__ == "__main__":
    raise SystemExit(MESSAGE)
raise RuntimeError(MESSAGE)

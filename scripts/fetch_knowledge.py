"""Knowledge Base Scraper & Ingestion Utility.

Supports:
1. Obscura CDP Engine (https://github.com/h4ckf0r0day/obscura) via localhost:9222.
2. Direct HTTP/HTML fetching with clean Markdown conversion.
3. Structured persistence to docs/knowledge/.
"""

from __future__ import annotations

import argparse
import asyncio
import re
import sys
from pathlib import Path

import httpx

KNOWLEDGE_DIR = Path(__file__).resolve().parent.parent / "docs" / "knowledge"


def clean_html_to_markdown(html_text: str) -> str:
    """Lightweight regex-based HTML-to-Markdown cleaner."""
    # Remove script and style tags
    text = re.sub(r"<script[^>]*>[\s\S]*?</script>", "", html_text, flags=re.IGNORECASE)
    text = re.sub(r"<style[^>]*>[\s\S]*?</style>", "", text, flags=re.IGNORECASE)

    # Headers
    text = re.sub(r"<h1[^>]*>(.*?)</h1>", r"# \1\n\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<h2[^>]*>(.*?)</h2>", r"## \1\n\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<h3[^>]*>(.*?)</h3>", r"### \1\n\n", text, flags=re.IGNORECASE)

    # Paragraphs and line breaks
    text = re.sub(r"<p[^>]*>(.*?)</p>", r"\1\n\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)

    # Strip remaining HTML tags
    text = re.sub(r"<[^>]+>", "", text)

    # Normalize excessive newlines
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


async def fetch_url(url: str, output_path: Path, use_obscura: bool = False) -> bool:
    """Fetch URL and write to output path."""
    print(f"[Knowledge] Fetching {url}...")

    if use_obscura:
        # Check if local Obscura CDP server is running on :9222
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.get("http://localhost:9222/json/version")
                if res.status_code == 200:
                    print("[Knowledge] Obscura CDP engine detected on :9222.")
        except httpx.HTTPError:
            print("[Knowledge] Obscura not running on :9222. Falling back to HTTP client.")

    headers = {
        "User-Agent": "BlueTraceAI-KnowledgeScraper/1.0 (Engineering Research)"
    }

    try:
        async with httpx.AsyncClient(headers=headers, follow_redirects=True, timeout=15.0) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                print(f"[Knowledge] Error: Received status code {resp.status_code} for {url}")
                return False

            content_type = resp.headers.get("content-type", "")
            if "html" in content_type:
                body = clean_html_to_markdown(resp.text)
            else:
                body = resp.text

            output_path.parent.mkdir(parents=True, exist_ok=True)
            output_path.write_text(body, encoding="utf-8")
            print(f"[Knowledge] Successfully saved {len(body)} chars to {output_path}")
            return True

    except (httpx.HTTPError, OSError) as exc:
        print(f"[Knowledge] Request failed for {url}: {exc}")
        return False


def main() -> None:
    parser = argparse.ArgumentParser(description="Fetch and ingest knowledge docs")
    parser.add_argument("--url", help="Target URL to fetch")
    parser.add_argument("--out", help="Output filename inside docs/knowledge/")
    parser.add_argument("--obscura", action="store_true", help="Attempt Obscura CDP integration on port 9222")
    args = parser.parse_args()

    if not args.url or not args.out:
        print("Usage: python scripts/fetch_knowledge.py --url <URL> --out <filename.md> [--obscura]")
        sys.exit(1)

    out_file = KNOWLEDGE_DIR / args.out
    success = asyncio.run(fetch_url(args.url, out_file, use_obscura=args.obscura))
    if not success:
        sys.exit(1)


if __name__ == "__main__":
    main()

import json
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

OUT_DIR = Path(r"D:\bluetrace-ai\docs\meta_api")
OUT_DIR.mkdir(parents=True, exist_ok=True)

class HTMLTextExtractor(HTMLParser):
    def __init__(self):
        super().__init__()
        self.texts = []
    def handle_data(self, data):
        cleaned = data.strip()
        if cleaned:
            self.texts.append(cleaned)

def fetch_url(url: str, output_file: str, headers=None):
    print(f"Fetching {url} -> {output_file}...")
    req_headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    if headers:
        req_headers.update(headers)
    req = urllib.request.Request(url, headers=req_headers)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            content = resp.read().decode('utf-8', errors='ignore')
            
            # If HTML, extract text as well
            if "<html" in content.lower():
                parser = HTMLTextExtractor()
                parser.feed(content)
                plain_text = "\n".join(parser.texts)
                txt_path = OUT_DIR / f"{output_file}.txt"
                with open(txt_path, "w", encoding="utf-8") as f:
                    f.write(plain_text)
            
            raw_path = OUT_DIR / f"{output_file}.raw"
            with open(raw_path, "w", encoding="utf-8") as f:
                f.write(content)
            print(f"  [OK] Saved {output_file} ({len(content)} chars)")
            return content
    except (urllib.error.URLError, json.JSONDecodeError, OSError) as e:
        print(f"  [FAIL] {url}: {e}")
        return None

def fetch_github_api(repo: str, path: str = ""):
    api_url = f"https://api.github.com/repos/{repo}/contents/{path}"
    print(f"Checking GitHub repo: {api_url}...")
    req = urllib.request.Request(api_url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode('utf-8'))
            return data
    except (urllib.error.URLError, json.JSONDecodeError, OSError) as e:
        print(f"  GitHub API error for {repo}/{path}: {e}")
        return None

# 1. Fetch Dev Meta AI Docs
pages = [
    ("https://dev.meta.ai/docs/overview", "meta_overview"),
    ("https://dev.meta.ai/docs/quickstart", "meta_quickstart"),
    ("https://dev.meta.ai/docs/models", "meta_models"),
    ("https://developers.meta.com/resources/videos/multimodal-intelligence-of-muse-spark/", "video_muse_spark"),
    ("https://developers.meta.com/resources/videos/building-with-muse-spark-and-muse-code/", "video_building_muse_code"),
    ("https://developers.meta.com/resources/videos/the-road-ahead-superintelligence-blueprint/", "video_superintelligence_blueprint"),
]

for url, name in pages:
    fetch_url(url, name)

# 2. Check and fetch GitHub Cookbooks
repos = [
    "meta-models/meta-model-cookbook",
    "meta-models/meta-oss-cookbook"
]

for repo in repos:
    items = fetch_github_api(repo)
    if items and isinstance(items, list):
        for item in items:
            if item.get("name") in ["README.md", "README", "quickstart.md"] or item.get("type") == "file":
                download_url = item.get("download_url")
                if download_url:
                    fetch_url(download_url, f"{repo.replace('/', '_')}_{item.get('name')}")

print("Offline documentation download routine finished.")

from __future__ import annotations

import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
dist = root / "dist"
index_path = dist / "index.html"
js_path = next((dist / "assets").glob("index-*.js"))
css_path = next((dist / "assets").glob("index-*.css"))

html = index_path.read_text(encoding="utf-8")
js = js_path.read_text(encoding="utf-8")
css = css_path.read_text(encoding="utf-8")
js = re.sub(r"\n?//# sourceMappingURL=.*?$", "", js, flags=re.MULTILINE)
js = js.replace("</script", "<\\/script")

html = re.sub(r"\s*<script type=\"module\" crossorigin src=\"/assets/index-[^\"]+\.js\"></script>", "", html)
html = re.sub(r"\s*<link rel=\"stylesheet\" crossorigin href=\"/assets/index-[^\"]+\.css\">", "", html)
html = html.replace("</head>", f"<style>{css}</style></head>")
html = html.replace("</body>", f"<script type=\"module\">{js}</script></body>")

output = root / "The-Stand-Standalone.html"
output.write_text(html, encoding="utf-8")
print(f"Wrote {output} ({output.stat().st_size} bytes)")

"""Inline the shop photos into directions.template.html -> directions.html (self-contained page)."""
import base64, pathlib, sys
here = pathlib.Path(__file__).resolve().parent
imgs = {"hero": "hero-800.webp", "paint": "paint.webp", "pdr": "pdr.webp", "carbon": "carbon.webp", "shop": "shop.webp"}
html = (here / "directions.template.html").read_text()
for key, name in imgs.items():
    data = base64.b64encode((here.parent / "images" / name).read_bytes()).decode()
    html = html.replace("{{%s}}" % key, "data:image/webp;base64," + data)
out = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else here / "directions.html"
out.write_text(html)
print(out, len(html) // 1024, "KB")

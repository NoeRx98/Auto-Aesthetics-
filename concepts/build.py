"""Inline the shop photos into a *.template.html page.

Usage: python3 build.py [template-name] [out-path]   (default: directions)"""
import base64, pathlib, sys
here = pathlib.Path(__file__).resolve().parent
imgs = {"hero": "hero-800.webp", "paint": "paint.webp", "pdr": "pdr.webp", "carbon": "carbon.webp", "shop": "shop.webp",
        "gclass1": "g-class-quarter-1.webp", "gclass2": "g-class-quarter-2.webp", "carbontop": "carbon-hood-top.webp",
        "carbondetail": "carbon-hood-detail.webp", "gt53": "gt53-front.webp"}
name = sys.argv[1] if len(sys.argv) > 1 else "directions"
html = (here / (name + ".template.html")).read_text()
for key, fname in imgs.items():
    data = base64.b64encode((here.parent / "images" / fname).read_bytes()).decode()
    html = html.replace("{{%s}}" % key, "data:image/webp;base64," + data)
out = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else here / (name + ".html")
out.write_text(html)
print(out, len(html) // 1024, "KB")

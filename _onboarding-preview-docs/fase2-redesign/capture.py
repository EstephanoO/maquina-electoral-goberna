"""
Captura screenshots de las slides del deck Fase 2.

Apunta a /dev-preview/fase2 (un único preview, sin modos — Fase 2
es un deck adaptativo según el form, no tiene min/full).

Output: _onboarding-preview-docs/fase2-redesign/slides/slide-NN.png

Asume dev server corriendo en http://localhost:3000.
"""
from __future__ import annotations

import os
import re
import sys
from pathlib import Path

from playwright.sync_api import sync_playwright


OUTPUT_DIR = Path(__file__).parent / "slides"
PORT = int(os.environ.get("PORT", "3000"))


def main():
    OUTPUT_DIR.mkdir(exist_ok=True, parents=True)
    url = f"http://localhost:{PORT}/dev-preview/fase2"

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            viewport={"width": 1440, "height": 900},
            device_scale_factor=2,
        )
        page = ctx.new_page()

        print(f"→ navegar {url}", flush=True)
        page.goto(url, wait_until="networkidle", timeout=60_000)
        page.wait_for_timeout(2_500)

        # Detectar total — buscar patrón "N / M" en el body
        try:
            body = page.locator("body").inner_text(timeout=5_000)
            m = re.search(r"(\d+)\s*/\s*(\d+)", body)
            total = int(m.group(2)) if m else 14
        except Exception:
            total = 14
        print(f"total slides: {total}", flush=True)

        for i in range(total):
            page.wait_for_timeout(1_800)  # esperar anim completa
            path = OUTPUT_DIR / f"slide-{i+1:02d}.png"
            page.screenshot(path=str(path), full_page=False)
            print(f"  [{i+1}/{total}] {path.name}", flush=True)
            if i < total - 1:
                page.keyboard.press("ArrowRight")

        browser.close()

    build_compare_html(total)
    print(f"\nDone. Open: {OUTPUT_DIR.parent / 'compare.html'}", flush=True)


def build_compare_html(total: int) -> None:
    slides = []
    for i in range(1, total + 1):
        slides.append(
            f"<div class='row'>"
            f"<div class='cap'>slide {i:02d}</div>"
            f"<img src='slides/slide-{i:02d}.png' />"
            f"</div>"
        )
    body = "\n".join(slides)
    html = f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Fase 2 deck — capturas</title>
<style>
  body {{ font-family: -apple-system, system-ui, sans-serif; background: #0a0e1a; color: #e2e8f0; margin: 0; padding: 24px; }}
  h1 {{ font-size: 24px; margin: 0 0 24px; color: #f6c11a; }}
  .row {{ margin-bottom: 40px; border-radius: 12px; overflow: hidden; background: #131b2e; padding: 12px; }}
  .cap {{ font-size: 12px; text-transform: uppercase; letter-spacing: 0.2em; margin-bottom: 8px; color: #94a3b8; }}
  img {{ width: 100%; height: auto; border-radius: 6px; display: block; }}
</style>
</head>
<body>
<h1>Fase 2 deck — {total} slides</h1>
{body}
</body>
</html>
"""
    (OUTPUT_DIR.parent / "compare.html").write_text(html, encoding="utf-8")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"FAIL: {e}", file=sys.stderr, flush=True)
        sys.exit(1)

"""
Captura screenshots de las slides del deck Fase 2 rediseñado.

Modos:
  full → /dev-preview/fase2/full  (14 slides visibles)
  min  → /dev-preview/fase2/min   (slides con datos vacíos, ~4 visibles)

Output: _onboarding-preview-docs/fase2-redesign/<mode>/slide-NN.png

El dev server lo levanta el helper with_server.py (al-llamar este script
con `python with_server.py --server "bun run dev" --port 3000 -- python capture.py`).
"""
from __future__ import annotations

import os
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright


OUTPUT_ROOT = Path(__file__).parent
PORT = int(os.environ.get("PORT", "3000"))


def capture_mode(page, mode: str) -> int:
    """Navega al preview, avanza slide por slide, captura PNG cada una."""
    out_dir = OUTPUT_ROOT / mode
    out_dir.mkdir(exist_ok=True, parents=True)

    url = f"http://localhost:{PORT}/dev-preview/fase2/{mode}"
    print(f"  → navegar {url}", flush=True)
    page.goto(url, wait_until="networkidle", timeout=60_000)
    # Dar tiempo extra a maplibre + framer-motion
    page.wait_for_timeout(2_500)

    # Leer total — extraer dígitos via regex sobre el body
    import re
    try:
        body_text = page.locator("body").inner_text(timeout=5_000)
        # Buscar patrón "N / M" en formato strict
        m = re.search(r"(\d+)\s*/\s*(\d+)", body_text)
        if m:
            total = int(m.group(2))
        else:
            raise ValueError("counter not found in body")
    except Exception as e:
        print(f"  ⚠ no pude leer el counter, default 14: {e}", flush=True)
        total = 14

    print(f"  total slides detectadas: {total}", flush=True)

    for i in range(total):
        page.wait_for_timeout(1_800)  # esperar animaciones completas (Hero stagger ~1.55s, CountUp ~1.4s)
        path = out_dir / f"slide-{i+1:02d}.png"
        page.screenshot(path=str(path), full_page=False)
        print(f"    [{i+1}/{total}] {path.name}", flush=True)
        if i < total - 1:
            page.keyboard.press("ArrowRight")

    return total


def main():
    OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        ctx = browser.new_context(
            viewport={"width": 1440, "height": 900},
            device_scale_factor=2,
        )
        page = ctx.new_page()

        print("[full mode]", flush=True)
        full_count = capture_mode(page, "full")

        print("[min mode]", flush=True)
        min_count = capture_mode(page, "min")

        browser.close()

    # Generar HTML de comparación
    build_compare_html(full_count, min_count)
    print(f"\nDone. Open: {OUTPUT_ROOT / 'compare.html'}", flush=True)


def build_compare_html(full_count: int, min_count: int) -> None:
    slides = []
    for i in range(1, full_count + 1):
        slides.append(
            f"<div class='row'>"
            f"<div class='cap'>slide {i} · full</div>"
            f"<img src='full/slide-{i:02d}.png' />"
            f"</div>"
        )
    for i in range(1, min_count + 1):
        slides.append(
            f"<div class='row min'>"
            f"<div class='cap'>slide {i} · min</div>"
            f"<img src='min/slide-{i:02d}.png' />"
            f"</div>"
        )
    body = "\n".join(slides)
    html = f"""<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>Fase 2 redesign — capturas</title>
<style>
  body {{ font-family: -apple-system, system-ui, sans-serif; background: #0a0e1a; color: #e2e8f0; margin: 0; padding: 24px; }}
  h1 {{ font-size: 24px; margin: 0 0 24px; color: #f6c11a; }}
  .row {{ margin-bottom: 40px; border-radius: 12px; overflow: hidden; background: #131b2e; padding: 12px; }}
  .row.min {{ border-left: 4px solid #f6c11a; }}
  .cap {{ font-size: 12px; text-transform: uppercase; letter-spacing: 0.2em; margin-bottom: 8px; color: #94a3b8; }}
  img {{ width: 100%; height: auto; border-radius: 6px; display: block; }}
</style>
</head>
<body>
<h1>Fase 2 deck — Rediseño · {full_count} slides full · {min_count} slides min</h1>
{body}
</body>
</html>
"""
    (OUTPUT_ROOT / "compare.html").write_text(html, encoding="utf-8")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"FAIL: {e}", file=sys.stderr, flush=True)
        sys.exit(1)

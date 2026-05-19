"""Pre-download CARTO basemap tiles for the Bordeaux atlas reference.

Box covers the Médoc strip + Bordeaux city with comfortable padding so
fitBounds() and a few clicks of zoom-in still hit local tiles.
"""

from __future__ import annotations
import math
import os
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

LAT_MIN, LAT_MAX = 44.5, 45.5
LON_MIN, LON_MAX = -1.0, -0.4
ZOOM_RANGE = range(8, 13)  # 8..12 inclusive

STYLES = {
    "dark": "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png",
    "light": "https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}.png",
}
SUBDOMAINS = ["a", "b", "c", "d"]

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "tiles")


def lon_to_x(lon: float, z: int) -> int:
    return int(math.floor((lon + 180.0) / 360.0 * (1 << z)))


def lat_to_y(lat: float, z: int) -> int:
    rad = math.radians(lat)
    return int(math.floor((1.0 - math.log(math.tan(rad) + 1.0 / math.cos(rad)) / math.pi) / 2.0 * (1 << z)))


def tile_jobs():
    for z in ZOOM_RANGE:
        x_lo = lon_to_x(LON_MIN, z)
        x_hi = lon_to_x(LON_MAX, z)
        y_lo = lat_to_y(LAT_MAX, z)
        y_hi = lat_to_y(LAT_MIN, z)
        for x in range(x_lo, x_hi + 1):
            for y in range(y_lo, y_hi + 1):
                for style in STYLES:
                    yield z, x, y, style


def fetch(z: int, x: int, y: int, style: str) -> tuple[str, bool]:
    out_dir = os.path.join(ROOT, style, str(z), str(x))
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, f"{y}.png")
    if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
        return out_path, True
    s = SUBDOMAINS[(x + y) % len(SUBDOMAINS)]
    url = STYLES[style].format(s=s, z=z, x=x, y=y)
    req = urllib.request.Request(url, headers={"User-Agent": "bordeaux-atlas-prefetch/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            data = r.read()
        with open(out_path, "wb") as f:
            f.write(data)
        return out_path, True
    except Exception as e:
        print(f"  FAIL z={z} x={x} y={y} {style}: {e}", file=sys.stderr)
        return out_path, False


def main() -> int:
    jobs = list(tile_jobs())
    print(f"Downloading {len(jobs)} tiles into {ROOT}")
    ok = 0
    failed = 0
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = [pool.submit(fetch, *j) for j in jobs]
        for fut in as_completed(futures):
            _, success = fut.result()
            if success:
                ok += 1
            else:
                failed += 1
    print(f"Done. {ok} ok, {failed} failed.")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())

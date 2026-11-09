from __future__ import annotations

import io
from pathlib import Path
from PIL import Image

NAMES_ORDER = (
    "Ada", "Binh", "Chi", "Duy", "Emi",
    "Finn", "Gia", "Hana", "Ivy", "Jae",
    "Khan", "Linh", "Minh", "Nora", "Owen",
    "Phuc", "Quynh", "Rin", "Son", "Trang",
    "Uma", "Vy", "Will", "Xuan", "Yen",
)

NAME_TO_INDEX = {name.lower(): i for i, name in enumerate(NAMES_ORDER)}

_AVATAR_CACHE: dict[str, bytes] = {}


def get_avatar_png(name_or_index: str | int, size: int = 140) -> bytes:
    """Extract and cache individual avatar PNG for given character name."""
    key = f"{name_or_index}:{size}"
    if key in _AVATAR_CACHE:
        return _AVATAR_CACHE[key]

    asset_path = Path(__file__).resolve().parents[1] / "assets" / "avt.png"
    if not asset_path.exists():
        # Fallback dummy 1x1 png
        img = Image.new("RGBA", (size, size), (200, 200, 200, 255))
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()

    sheet = Image.open(asset_path).convert("RGBA")
    w, h = sheet.size

    idx = 0
    if isinstance(name_or_index, int):
        idx = max(0, min(name_or_index, 24))
    elif isinstance(name_or_index, str):
        idx = NAME_TO_INDEX.get(name_or_index.strip().lower(), 0)

    c = idx % 5
    r = idx // 5
    x = int(c * w / 5.0) + 3
    y = int(r * h / 5.0) + 3
    tile_w = int((c + 1) * w / 5.0) - x - 3
    tile_h = int((r + 1) * h / 5.0) - y - 3

    tile = sheet.crop((x, y, x + tile_w, y + tile_h))
    tile = tile.resize((size, size), Image.Resampling.LANCZOS)

    buf = io.BytesIO()
    tile.save(buf, format="PNG")
    data = buf.getvalue()
    _AVATAR_CACHE[key] = data
    return data


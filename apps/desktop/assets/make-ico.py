"""Builds Exordium's multi-resolution Windows .ico from its square PNG (exordium-icon.png).

Windows picks a size per context: 16px for the title bar and Alt+Tab, 24-32px for the taskbar, 48px
in Explorer, 256px for large tiles and the Start menu. Each entry is stored as a PNG, which Vista and
later accept at any size, and which keeps the alpha channel.

The artwork is the book alone on transparency (no tile). It is mostly near-black, so the sizes up
to 32px are lifted with contrast and brightness and sharpened: shrunk as drawn, the cover vanishes
into a dark taskbar and only the cyan edges remain. 48px and up are the artwork as drawn.

The .ico is committed; run this again when the artwork changes (needs Pillow):

    python apps/desktop/assets/make-ico.py
"""

import io
import struct
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter

HERE = Path(__file__).parent
SIZES = [16, 24, 32, 48, 64, 128, 256]

master = Image.open(HERE / "exordium-icon.png").convert("RGBA").resize((256, 256), Image.LANCZOS)


def sharpen(image: Image.Image, radius: float, percent: int) -> Image.Image:
    rgb = image.convert("RGB").filter(ImageFilter.UnsharpMask(radius=radius, percent=percent, threshold=0))
    return Image.merge("RGBA", (*rgb.split(), image.split()[3]))


def render(size: int) -> Image.Image:
    out = master.resize((size, size), Image.LANCZOS)
    if size <= 32:
        alpha = out.split()[3]
        rgb = out.convert("RGB")
        rgb = ImageEnhance.Contrast(rgb).enhance(1.3)
        rgb = ImageEnhance.Brightness(rgb).enhance(1.45)
        rgb = ImageEnhance.Color(rgb).enhance(1.3)
        out = sharpen(Image.merge("RGBA", (*rgb.split(), alpha)), 0.6, 110)
    elif size <= 48:
        out = sharpen(out, 0.8, 90)
    return out


pngs = []
for size in SIZES:
    buffer = io.BytesIO()
    render(size).save(buffer, "PNG", optimize=True)
    pngs.append(buffer.getvalue())

# ICONDIR (6 bytes), one 16-byte ICONDIRENTRY per image (0 means 256: the field is one byte), images.
data = struct.pack("<HHH", 0, 1, len(SIZES))
offset = 6 + 16 * len(SIZES)
for size, png in zip(SIZES, pngs):
    edge = 0 if size >= 256 else size
    data += struct.pack("<BBBBHHII", edge, edge, 0, 0, 1, 32, len(png), offset)
    offset += len(png)
data += b"".join(pngs)
(HERE / "exordium.ico").write_bytes(data)
print(f"Wrote {HERE / 'exordium.ico'} ({', '.join(map(str, SIZES))} px)")

#!/usr/bin/env python3
"""
Przygotowuje portrety postaci z obrazów źródłowych (art/src/pNN.jpg) do assets/ (kwadrat 512×512).
Uruchom: python3 content/cases/zawierzbie/art/portraits.py   (wymaga Pillow)

Kadr obejmuje głowę i ramiona; plakietka na ladzie recepcji zostaje poza kadrem.
"""
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
SRC = HERE / "src"
OUT = HERE.parent / "assets"
SIZE = 512

# plik: (środek kadru x, górna krawędź y, bok kwadratu) w pikselach obrazu źródłowego
CROPS = {
    "p01.jpg": (810, 35, 430),  # Wiktor Ostrowski
    "p02.jpg": (840, 35, 430),  # Marta Ostrowska
    "p03.jpg": (875, 35, 430),  # Paweł Ostrowski
    "p04.jpg": (815, 35, 430),  # Joanna Kret
    "p05.jpg": (775, 35, 430),  # dr Tomasz Lisiecki
}


def build():
    for name, (cx, top, side) in CROPS.items():
        src = SRC / name
        if not src.exists():
            continue
        img = Image.open(src).convert("RGB")
        box = (cx - side // 2, top, cx + side // 2, top + side)
        img.crop(box).resize((SIZE, SIZE), Image.LANCZOS).save(OUT / name, quality=88, optimize=True, progressive=True)


if __name__ == "__main__":
    build()
    print("Zapisano:", ", ".join(sorted(p.name for p in OUT.glob("p*.jpg"))))

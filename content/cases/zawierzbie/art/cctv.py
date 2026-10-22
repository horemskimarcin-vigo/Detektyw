#!/usr/bin/env python3
"""
Przygotowuje klatki monitoringu z obrazów źródłowych (art/src/cNN.jpg) do assets/ (1600×900, 16:9).
Uruchom: python3 content/cases/zawierzbie/art/cctv.py   (wymaga Pillow i numpy)

- podmienia wypalony znacznik czasu na zgodny ze sprawą,
- przemalowuje biały samochód zaparkowany na ulicy w późniejszych klatkach na ciemny
  (żeby nie mylił się z autem, które wyjeżdża o 18:31),
- nanosi logo firmy na bus i fragment tablicy rejestracyjnej.
Klatki, których nie ma w art/src, generuje build.py (SVG).
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
SRC = HERE / "src"
OUT = HERE.parent / "assets"
SIZE = (1600, 900)
MONO_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationMono-Regular.ttf",
    "C:/Windows/Fonts/consola.ttf",
    "/Library/Fonts/Courier New.ttf",
]
SANS_BOLD_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "/Library/Fonts/Arial Bold.ttf",
]


def font(candidates, size):
    for p in candidates:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def timestamp(img, text):
    """Zastępuje wypalony znacznik czasu (prawy górny róg)."""
    d = ImageDraw.Draw(img)
    d.rectangle((1138, 0, 1408, 18), fill=(18, 18, 18))
    d.text((1404, 1), text, font=font(MONO_CANDIDATES, 16), fill=(238, 238, 238), anchor="ra")


def darken_car(img, box, keep=None):
    """Lakier w obrysie auta → ciemny (cienie i odblaski zostają, czerwone światła bez zmian)."""
    im = np.asarray(img).astype(float) / 255
    x0, y0, x1, y1 = box
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(box, radius=min(x1 - x0, y1 - y0) // 4, fill=255)
    m = np.asarray(mask.filter(ImageFilter.GaussianBlur(2))).astype(float)[y0:y1, x0:x1] / 255
    region = im[y0:y1, x0:x1]
    r, g, b = region[..., 0], region[..., 1], region[..., 2]
    red = np.clip((r - np.maximum(g, b) * 1.35) / 0.15, 0, 1)  # tylne światła (z jasnym środkiem)
    red = np.asarray(Image.fromarray((red * 255).astype("uint8")).filter(ImageFilter.MaxFilter(9))
                     .filter(ImageFilter.GaussianBlur(1.5))).astype(float) / 255
    w = m * (1 - red) * np.clip((region.max(axis=2) - 0.18) / 0.15, 0, 1)
    if keep:
        kx0, ky0, kx1, ky1 = keep
        w[ky0 - y0:ky1 - y0, kx0 - x0:kx1 - x0] = 0
    lum = region.mean(axis=2, keepdims=True)
    dark = lum * 0.22 + np.array([0.02, 0.025, 0.045])  # granat/grafit
    region[:] = region * (1 - w[..., None]) + dark * w[..., None]
    return Image.fromarray((np.clip(im, 0, 1) * 255).astype("uint8"))


def clone_from(img, donor, box, feather=12):
    """Wstawia fragment z innej klatki tego samego ujęcia; oświetlenie (gradient) dopasowane do otoczenia."""
    a = np.asarray(img).astype(float)
    b = np.asarray(donor).astype(float)
    x0, y0, x1, y1 = box
    pad = 16
    ring = np.zeros(a.shape[:2], bool)
    ring[y0 - pad:y1 + pad, x0 - pad:x1 + pad] = True
    ring[y0:y1, x0:x1] = False
    ys, xs = np.nonzero(ring)
    A = np.stack([np.ones_like(xs), xs, ys, xs * xs, ys * ys, xs * ys], axis=1).astype(float)
    gy, gx = np.mgrid[y0 - pad:y1 + pad, x0 - pad:x1 + pad]
    G = np.stack([np.ones_like(gx), gx, gy, gx * gx, gy * gy, gx * gy], axis=-1).astype(float)
    sl = (slice(y0 - pad, y1 + pad), slice(x0 - pad, x1 + pad))
    matched = a.copy()
    for c in range(3):
        fa = G @ np.linalg.lstsq(A, a[ys, xs, c], rcond=None)[0]
        fb = G @ np.linalg.lstsq(A, b[ys, xs, c], rcond=None)[0]
        matched[sl + (c,)] = b[sl + (c,)] - fb + fa
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle(box, radius=feather, fill=255)
    m = np.asarray(mask.filter(ImageFilter.GaussianBlur(feather / 2))).astype(float)[..., None] / 255
    out = a * (1 - m) + matched * m
    return Image.fromarray(np.clip(out, 0, 255).astype("uint8"))


def patch(img, cx, cy, r):
    """Zamazuje drobny element (np. znaczek marki) kolorem otoczenia."""
    im = np.asarray(img).astype(float)
    ring = []
    for y in range(cy - r - 3, cy + r + 4):
        for x in range(cx - r - 3, cx + r + 4):
            dd = (x - cx) ** 2 + (y - cy) ** 2
            if r * r < dd <= (r + 3) ** 2:
                ring.append(im[y, x])
    c = np.mean(ring, axis=0)
    d = ImageDraw.Draw(img)
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=tuple(int(v) for v in c))
    return img


def plate(img, box, text):
    x0, y0, x1, y1 = box
    layer = Image.new("RGBA", (x1 - x0, y1 - y0), (232, 232, 228, 255))
    d = ImageDraw.Draw(layer)
    d.rectangle((0, 0, 3, y1 - y0), fill=(30, 60, 150, 255))
    f = font(MONO_CANDIDATES, 9)
    d.text((5, (y1 - y0) / 2), text, font=f, fill=(20, 20, 20, 255), anchor="lm")
    img.paste(layer.filter(ImageFilter.GaussianBlur(0.35)), (x0, y0))
    return img


def van_logo(img, origin, shear=-0.04):
    """Logo firmy na boku busa (lekko ścięte, zgodnie z perspektywą)."""
    layer = Image.new("RGBA", (215, 48), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.text((2, 20), "BĄK-REMONTY", font=font(SANS_BOLD_CANDIDATES, 24), fill=(28, 58, 120, 240), anchor="lm")
    d.text((4, 41), "tel. 600 123 456", font=font(SANS_BOLD_CANDIDATES, 9), fill=(28, 58, 120, 200), anchor="lm")
    layer = layer.transform(layer.size, Image.AFFINE, (1, 0, 0, shear, 1, 0), resample=Image.BICUBIC)
    img = img.convert("RGBA")
    img.alpha_composite(layer.filter(ImageFilter.GaussianBlur(0.3)), origin)
    return img.convert("RGB")


def save(img, name):
    img.convert("RGB").resize(SIZE, Image.LANCZOS).save(OUT / name, quality=86, optimize=True, progressive=True)


PARKED = (1150, 295, 1197, 415)  # biały samochód zaparkowany po prawej (za latarnią)


def build():
    # c01 – 18:31, biały hatchback wyjeżdża (auto kierowniczki)
    img = Image.open(SRC / "c01.jpg").convert("RGB")
    img = patch(img, 1089, 401, 4)
    img = plate(img, (1067, 427, 1105, 437), "TZA 47")
    timestamp(img, "14-11-2025 18:31:05")
    save(img, "c01.jpg")

    # c02 – 20:05, kobieta odchodzi; biały samochód z poprzedniej klatki usunięty (fragment pustej ulicy z c05)
    img = Image.open(SRC / "c02.jpg").convert("RGB")
    img = clone_from(img, Image.open(SRC / "c05.jpg").convert("RGB"), (985, 305, 1146, 545))
    timestamp(img, "14-11-2025 20:05:40")
    save(img, "c02.jpg")

    # c03 – 21:28, bus i kierowca
    img = Image.open(SRC / "c03.jpg").convert("RGB")
    img = darken_car(img, PARKED)
    img = van_logo(img, (712, 262))
    timestamp(img, "14-11-2025 21:28:12")
    save(img, "c03.jpg")

    # c04 – 21:41, bus odjeżdża
    img = Image.open(SRC / "c04.jpg").convert("RGB")
    img = darken_car(img, PARKED)
    img = van_logo(img, (712, 262))
    timestamp(img, "14-11-2025 21:41:30")
    save(img, "c04.jpg")

    # c05 – 23:58, pusto
    img = Image.open(SRC / "c05.jpg").convert("RGB")
    img = darken_car(img, PARKED)
    timestamp(img, "14-11-2025 23:58:00")
    save(img, "c05.jpg")


if __name__ == "__main__":
    build()
    print("Zapisano:", ", ".join(sorted(p.name for p in OUT.glob("c0*.jpg"))))

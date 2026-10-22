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


def van_logo(img, origin, shear=-0.04, scale=1.0):
    """Logo firmy na boku busa (lekko ścięte, zgodnie z perspektywą)."""
    layer = Image.new("RGBA", (215, 48), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.text((2, 20), "BĄK-REMONTY", font=font(SANS_BOLD_CANDIDATES, 24), fill=(28, 58, 120, 240), anchor="lm")
    d.text((4, 41), "tel. 600 123 456", font=font(SANS_BOLD_CANDIDATES, 9), fill=(28, 58, 120, 200), anchor="lm")
    if scale != 1.0:
        layer = layer.resize((round(215 * scale), round(48 * scale)), Image.LANCZOS)
    layer = layer.transform(layer.size, Image.AFFINE, (1, 0, 0, shear, 1, 0), resample=Image.BICUBIC)
    img = img.convert("RGBA")
    img.alpha_composite(layer.filter(ImageFilter.GaussianBlur(0.3)), origin)
    return img.convert("RGB")


def erase_text(img, poly, light_text, max_sat=1.0):
    """Usuwa napis w wielokącie: piksele napisu zastępuje kolorem tła (mediana z wielokąta)."""
    im = np.asarray(img).astype(float)
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).polygon(poly, fill=255)
    inside = np.asarray(mask) > 0
    lum = im.mean(axis=2)
    sat = (im.max(axis=2) - im.min(axis=2)) / (im.max(axis=2) + 1)
    lo, hi = np.percentile(lum[inside], [8, 92])
    thr = (lo + hi) / 2
    text = ((lum > thr) if light_text else (lum < thr)) & (sat <= max_sat) & inside
    text = np.asarray(Image.fromarray((text * 255).astype("uint8")).filter(ImageFilter.MaxFilter(3))) > 0
    text &= inside
    bg = np.median(im[inside & ~text], axis=0)
    rng = np.random.default_rng(7)
    im[text] = bg + rng.normal(0, 2.5, (text.sum(), 3))
    out = Image.fromarray(np.clip(im, 0, 255).astype("uint8"))
    soft = Image.fromarray((text * 255).astype("uint8")).filter(ImageFilter.GaussianBlur(1))
    return Image.composite(out.filter(ImageFilter.GaussianBlur(0.8)), out, soft)


def text_at(img, center, text, size, fill, angle=0.0, bold=True, blur=0.4):
    """Napis wyśrodkowany w punkcie, obrócony o kąt (stopnie, przeciwnie do ruchu wskazówek zegara)."""
    f = font(SANS_BOLD_CANDIDATES if bold else MONO_CANDIDATES, size)
    w = int(ImageDraw.Draw(Image.new("L", (1, 1))).textlength(text, font=f)) + 8
    layer = Image.new("RGBA", (w, size * 2), (0, 0, 0, 0))
    ImageDraw.Draw(layer).text((w / 2, size), text, font=f, fill=fill, anchor="mm")
    layer = layer.rotate(angle, resample=Image.BICUBIC, expand=True).filter(ImageFilter.GaussianBlur(blur))
    img = img.convert("RGBA")
    img.alpha_composite(layer, (round(center[0] - layer.width / 2), round(center[1] - layer.height / 2)))
    return img.convert("RGB")


def unyellow(img, box):
    """Żółta (brytyjska) tablica → biała."""
    im = np.asarray(img).astype(float)
    x0, y0, x1, y1 = box
    r = im[y0:y1, x0:x1]
    yellow = np.clip((np.minimum(r[..., 0], r[..., 1]) - r[..., 2] - 20) / 40, 0, 1)[..., None]
    lum = r.mean(axis=2, keepdims=True)
    white = np.concatenate([lum, lum, lum * 1.03], axis=2) * 1.15
    r[:] = r * (1 - yellow) + white * yellow
    return Image.fromarray(np.clip(im, 0, 255).astype("uint8"))


def eu_plate(img, center, size, text, angle=0.0, font_size=8):
    """Polska tablica rejestracyjna (biała, niebieski pasek UE), obrócona zgodnie z perspektywą."""
    w, h = size
    k = 4  # rysujemy w większej skali i zmniejszamy – czytelniejsze krawędzie
    layer = Image.new("RGBA", (w * k, h * k), (226, 228, 226, 255))
    d = ImageDraw.Draw(layer)
    d.rectangle((0, 0, round(w * k * 0.11), h * k), fill=(32, 64, 160, 255))
    d.text((w * k * 0.16, h * k / 2), text, font=font(SANS_BOLD_CANDIDATES, font_size * k), fill=(25, 25, 25, 255), anchor="lm")
    layer = layer.resize((w, h), Image.LANCZOS).rotate(angle, resample=Image.BICUBIC, expand=True)
    img = img.convert("RGBA")
    img.alpha_composite(layer.filter(ImageFilter.GaussianBlur(0.35)),
                        (round(center[0] - layer.width / 2), round(center[1] - layer.height / 2)))
    return img.convert("RGB")


def frame(img, crop, ts, cam, name):
    """Kadr 16:9 → 1600×900 ze znacznikiem czasu i numerem kamery."""
    img = img.crop(crop).resize(SIZE, Image.LANCZOS)
    d = ImageDraw.Draw(img)
    text = f"{cam}   14-11-2025 {ts}"
    f = font(MONO_CANDIDATES, 18)
    d.rectangle((SIZE[0] - d.textlength(text, font=f) - 14, 0, SIZE[0], 24), fill=(18, 18, 18))
    d.text((SIZE[0] - 6, 2), text, font=f, fill=(238, 238, 238), anchor="ra")
    img.save(OUT / name, quality=86, optimize=True, progressive=True)


def orlen_pump(img, dy):
    """Dystrybutor: angielskie napisy → polskie (dy – przesunięcie kadru między klatkami)."""
    img = erase_text(img, [(179, 446 + dy), (190, 446 + dy), (192, 487 + dy), (181, 487 + dy)], light_text=True)
    img = text_at(img, (185.5, 466 + dy), "ON", 10, (235, 235, 235, 235), angle=-86)
    img = erase_text(img, [(197, 440 + dy), (209, 438 + dy), (214, 490 + dy), (202, 492 + dy)], light_text=True, max_sat=0.3)
    img = text_at(img, (205.5, 465 + dy), "Pb95", 10, (235, 240, 235, 235), angle=-86)
    img = erase_text(img, [(259, 552 + dy), (314, 539 + dy), (314, 561 + dy), (259, 574 + dy)], light_text=False, max_sat=0.45)
    img = text_at(img, (287, 557 + dy), "PALIWA", 13, (70, 40, 60, 235), angle=13.5)
    return img


def orlen_shop(img, dy):
    """Szyld „NEWSAGENTS” → „PRASA”."""
    img = erase_text(img, [(484, 134 + dy), (563, 130 + dy), (563, 146 + dy), (484, 150 + dy)], light_text=False)
    return text_at(img, (523, 140 + dy), "PRASA", 12, (30, 30, 34, 235), angle=3)


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

    # c06 – stacja paliw, kamera K3: bus Bąka na Wiślanej
    img = Image.open(SRC / "c06.jpg").convert("RGB")
    img = orlen_pump(img, 0)
    img = orlen_shop(img, 0)
    img = eu_plate(img, (552, 357), (24, 7), "TZ 52K1", angle=-12, font_size=5)
    img = van_logo(img, (698, 244), shear=0.14, scale=0.55)
    frame(img, (0, 0, 1239, 697), "21:46:18", "ORLEN K3", "c06.jpg")

    # c07 – kamera K3: mały biały samochód, fragment tablicy
    img = Image.open(SRC / "c07.jpg").convert("RGB")
    img = orlen_pump(img, -5)
    img = orlen_shop(img, -5)
    img = patch(img, 586, 311, 6)
    img = unyellow(img, (566, 334, 600, 352))
    img = eu_plate(img, (583, 343), (32, 9), "TZA 47816", angle=-3, font_size=6)
    frame(img, (0, 0, 1230, 692), "22:09:51", "ORLEN K3", "c07.jpg")

    # c08 – kamera K1 (nad wiatą): taksówka
    img = Image.open(SRC / "c08.jpg").convert("RGB")
    img = erase_text(img, [(929, 405), (948, 405), (948, 414), (929, 414)], light_text=False)
    img = text_at(img, (938.5, 410), "TAXI", 7, (40, 30, 10, 230))
    img = unyellow(img, (1070, 467, 1092, 484))
    frame(img, (21, 0, 1386, 768), "22:31:07", "ORLEN K1", "c08.jpg")

    # c09 – kamera K1: pusto
    img = Image.open(SRC / "c09.jpg").convert("RGB")
    frame(img, (42, 0, 1366, 745), "23:20:44", "ORLEN K1", "c09.jpg")


if __name__ == "__main__":
    build()
    print("Zapisano:", ", ".join(sorted(p.name for p in OUT.glob("c*.jpg"))))

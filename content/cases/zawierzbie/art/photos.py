#!/usr/bin/env python3
"""
Przygotowuje fotografie sprawy z obrazów źródłowych (art/src/*.jpg) do katalogu assets/.
Uruchom: python3 content/cases/zawierzbie/art/photos.py   (wymaga Pillow i numpy)

- a01: usuwa szklaną tabliczkę z półki i dorysowuje czysty ośmiokątny ślad w kurzu,
- a04: nanosi odręczne wpisy w kalendarzu (czcionka Caveat, licencja OFL – fonts/OFL-Caveat.txt),
- a05: dodaje haft „Pod Lipami” na ręczniku,
- a02, a03: kopiuje bez zmian (z kompresją).
Współrzędne szczegółów (hotspots) w plikach materiałów odpowiadają tym obrazom (1408×768).
"""
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

HERE = Path(__file__).resolve().parent
SRC = HERE / "src"
OUT = HERE.parent / "assets"
HAND = HERE / "fonts" / "Caveat.ttf"
SANS_CANDIDATES = [
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "/Library/Fonts/Arial Bold.ttf",
]


def save(img, name):
    img.convert("RGB").save(OUT / name, quality=88, optimize=True, progressive=True)


def sans(size):
    for p in SANS_CANDIDATES:
        if Path(p).exists():
            return ImageFont.truetype(p, size)
    return ImageFont.truetype(str(HAND), size)


def hand(size, weight=500):
    f = ImageFont.truetype(str(HAND), size)
    try:
        f.set_variation_by_axes([weight])
    except Exception:
        pass
    return f


# ------------------------------------------------------------------ a01
def a01():
    img = Image.open(SRC / "a01.jpg").convert("RGB")
    im = np.asarray(img).astype(float)
    L, R, y0, y_wall, y1 = 1103, 1262, 30, 148, 172
    rng = np.random.default_rng(3)
    # próbki ściany wokół tabliczki (bez pucharów, dyplomu i wspornika) → gładka powierzchnia oświetlenia
    pts = [(x, y) for y in range(20, 30) for x in range(1062, 1262, 2)]
    pts += [(x, y) for y in range(30, 72) for x in range(1064, 1100, 2)]
    pts += [(x, y) for y in range(30, y_wall) for x in (1103, 1104, 1105, *range(1258, 1266))]
    P = np.array(pts)
    X, Y = P[:, 0].astype(float), P[:, 1].astype(float)
    A = np.stack([np.ones_like(X), X, Y, X * X, Y * Y, X * Y], axis=1)
    coef = [np.linalg.lstsq(A, im[P[:, 1], P[:, 0], c], rcond=None)[0] for c in range(3)]
    for y in range(y0, y_wall):
        for x in range(L, R):
            v = np.array([1, x, y, x * x, y * y, x * y], float)
            im[y, x] = [v @ coef[c] for c in range(3)] + rng.normal(0, 1.8, 3)
    # blat półki: interpolacja w poziomie
    for y in range(y_wall, y1):
        a = im[y, L - 8:L - 2].mean(axis=0)
        b = im[y, R + 2:R + 8].mean(axis=0)
        for x in range(L, R):
            t = (x - L) / (R - L)
            im[y, x] = a * (1 - t) + b * t + rng.normal(0, 1.8, 3)
    img2 = Image.fromarray(np.clip(im, 0, 255).astype("uint8"))
    mask = Image.new("L", img.size, 0)
    ImageDraw.Draw(mask).rectangle((L - 3, y0 - 3, R + 3, y1), fill=255)
    img2 = Image.composite(img2.filter(ImageFilter.GaussianBlur(1.1)), img2, mask.filter(ImageFilter.GaussianBlur(3)))
    # kurz i czysty ośmiokąt
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.rounded_rectangle((1104, 152, 1262, 161), radius=4, fill=(205, 194, 172, 60))
    cx, cy, w, h = 1172, 156.5, 33, 4.0
    octagon = [(cx - w * 0.42, cy - h), (cx + w * 0.42, cy - h), (cx + w, cy - h * 0.4), (cx + w, cy + h * 0.4),
               (cx + w * 0.42, cy + h), (cx - w * 0.42, cy + h), (cx - w, cy + h * 0.4), (cx - w, cy - h * 0.4)]
    d.polygon(octagon, fill=(58, 38, 24, 200))
    layer = layer.filter(ImageFilter.GaussianBlur(1.6))
    save(Image.alpha_composite(img2.convert("RGBA"), layer), "a01.jpg")


# ------------------------------------------------------------------ a04 – kalendarz
INK = (28, 40, 78)
INK_GREY = (78, 84, 98)
RED = (150, 28, 28)
HEAD = (120, 30, 30)

LEFT_X, RIGHT_X, LINE_W = 295, 745, 380


def write(d, x, line_y, text, size=30, color=INK, weight=500, max_w=LINE_W):
    f = hand(size, weight)
    while d.textlength(text, font=f) > max_w and size > 18:
        size -= 1
        f = hand(size, weight)
    d.text((x, line_y - 2), text, font=f, fill=color, anchor="ls")
    return f


def head(d, x, line_y, text):
    d.text((x, line_y - 4), text, font=sans(15), fill=HEAD, anchor="ls")


def a04():
    img = Image.open(SRC / "a04.jpg").convert("RGBA")
    layer = Image.new("RGBA", img.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    # lewa strona
    head(d, LEFT_X, 116, "ŚRODA 12 LISTOPADA")
    write(d, LEFT_X + 10, 160, "Gastro-Pol – zamówienie na grudzień", 26, INK_GREY)
    f = write(d, LEFT_X + 10, 204, "13:00 Lisiecki – obiad (NIE sprzedaję!)", 30)
    x0 = LEFT_X + 10 + d.textlength("13:00 Lisiecki – obiad (", font=f)
    x1 = LEFT_X + 10 + d.textlength("13:00 Lisiecki – obiad (NIE sprzedaję!", font=f)
    d.line((x0, 208, x1, 207), fill=INK, width=2)
    d.line((x0 + 3, 213, x1 - 2, 212), fill=INK, width=2)
    head(d, LEFT_X, 314, "CZWARTEK 13 LISTOPADA")
    write(d, LEFT_X + 10, 359, "dach – reklamacja (Bąk)", 26, INK_GREY)
    f = write(d, LEFT_X + 10, 404, "17:30 E. Dziedzic – faktury?? B-R / KRS", 30)
    bx0 = LEFT_X + 10 + d.textlength("17:30 E. Dziedzic – faktury?? ", font=f)
    bx1 = LEFT_X + 10 + d.textlength("17:30 E. Dziedzic – faktury?? B-R", font=f)
    d.ellipse((bx0 - 8, 378, bx1 + 8, 412), outline=RED, width=2)
    head(d, LEFT_X, 495, "PIĄTEK 14 LISTOPADA")
    write(d, LEFT_X + 10, 541, "gala Dworek – NIE idę", 26, INK_GREY)
    write(d, LEFT_X + 10, 587, "21:30 J.K. – faktury B-R !!", 36, RED, weight=650)
    # prawa strona
    head(d, RIGHT_X, 116, "SOBOTA 15 LISTOPADA")
    write(d, RIGHT_X + 10, 160, "zamki skrzydło zach. – ślusarz pon.", 26, INK_GREY)
    head(d, RIGHT_X, 247, "NIEDZIELA 16 LISTOPADA")
    head(d, RIGHT_X, 404, "PONIEDZIAŁEK 17 LISTOPADA")
    f = write(d, RIGHT_X + 10, 450, "10:00 Prokuratura – zawiadomienie (teczka!)", 30)
    w = d.textlength("10:00 Prokuratura – zawiadomienie (teczka!)", font=f)
    for x in range(RIGHT_X, int(RIGHT_X + w + 22), 12):
        d.line((x, 420, x + 6, 420), fill=INK, width=2)
        d.line((x, 458, x + 6, 458), fill=INK, width=2)
    d.line((RIGHT_X, 420, RIGHT_X, 458), fill=INK, width=2)
    d.line((RIGHT_X + w + 22, 420, RIGHT_X + w + 22, 458), fill=INK, width=2)
    write(d, RIGHT_X + 10, 495, "zadzw. do Marty ws. ugody?", 26, INK_GREY)
    # atrament lekko „wsiąka” w papier
    layer = layer.filter(ImageFilter.GaussianBlur(0.45))
    save(Image.alpha_composite(img, layer), "a04.jpg")


# ------------------------------------------------------------------ a05 – haft na ręczniku
def a05():
    img = Image.open(SRC / "a05.jpg").convert("RGBA")
    layer = Image.new("RGBA", (420, 120), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.text((10, 80), "Pod Lipami", font=hand(40, 650), fill=(92, 120, 78, 215), anchor="ls")
    d.line((14, 90, 200, 90), fill=(92, 120, 78, 160), width=3)
    layer = layer.rotate(-4, resample=Image.BICUBIC, expand=True).filter(ImageFilter.GaussianBlur(0.6))
    img.alpha_composite(layer, (745, 505))
    save(img, "a05.jpg")


def copy(name):
    save(Image.open(SRC / name), name)


if __name__ == "__main__":
    a01()
    copy("a02.jpg")
    copy("a03.jpg")
    a04()
    a05()
    print("Zapisano:", ", ".join(sorted(p.name for p in OUT.glob("a0*.jpg"))))

#!/usr/bin/env python3
"""
Generator ilustracji sprawy „zawierzbie” (SVG, styl: sepiowe zdjęcia techników i zielonkawy monitoring).
Uruchom: python3 content/cases/zawierzbie/art/build.py
Położenie elementów MUSI odpowiadać współrzędnym szczegółów (hotspots) w plikach materiałów.
Pliki wynikowe mają neutralne nazwy (a01.svg, c01.svg…), by nie zdradzać treści.
Grafiki można podmienić na dowolne własne (te same nazwy plików i proporcje).
"""
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "assets"
OUT.mkdir(exist_ok=True)

FONT = "font-family='Helvetica, Arial, sans-serif'"
HAND = "font-family='Segoe Print, Bradley Hand, Comic Sans MS, cursive'"
MONO = "font-family='Courier New, monospace'"


def photo_defs(w, h):
    return f"""
<defs>
  <filter id='grain' x='0' y='0' width='100%' height='100%'>
    <feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' seed='7' result='n'/>
    <feColorMatrix type='saturate' values='0' in='n' result='g'/>
    <feComponentTransfer in='g' result='ga'><feFuncA type='linear' slope='0.18'/></feComponentTransfer>
    <feBlend in='SourceGraphic' in2='ga' mode='multiply'/>
  </filter>
  <filter id='sepia'>
    <feColorMatrix type='matrix' values='0.39 0.69 0.17 0 0  0.35 0.62 0.15 0 0  0.27 0.48 0.12 0 0  0 0 0 1 0'/>
  </filter>
  <radialGradient id='vig' cx='50%' cy='50%' r='75%'>
    <stop offset='55%' stop-color='#000' stop-opacity='0'/>
    <stop offset='100%' stop-color='#000' stop-opacity='0.65'/>
  </radialGradient>
  <linearGradient id='wood' x1='0' x2='0' y1='0' y2='1'>
    <stop offset='0' stop-color='#6b4f36'/><stop offset='1' stop-color='#4a3524'/>
  </linearGradient>
</defs>"""


def photo(name, w, h, body, label):
    svg = f"""<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {w} {h}' width='{w}' height='{h}'>
{photo_defs(w, h)}
<g filter='url(#sepia)'><g filter='url(#grain)'>
{body}
</g></g>
<rect width='{w}' height='{h}' fill='url(#vig)'/>
<text x='{w-30}' y='{h-24}' text-anchor='end' {MONO} font-size='22' fill='#f2e6c8' opacity='0.85'>{label}</text>
</svg>"""
    (OUT / name).write_text(svg, encoding="utf-8")


def marker(x, y, n):
    return f"""<g transform='translate({x} {y})'>
  <polygon points='-22,30 22,30 0,-26' fill='#e8c21a' stroke='#3a2c05' stroke-width='3'/>
  <text x='0' y='22' text-anchor='middle' {FONT} font-weight='700' font-size='26' fill='#1b1405'>{n}</text></g>"""


def octagon(cx, cy, r, sy=1.0):
    import math
    pts = []
    for i in range(8):
        a = math.pi / 8 + i * math.pi / 4
        pts.append(f"{cx + r*math.cos(a):.1f},{cy + r*math.sin(a)*sy:.1f}")
    return " ".join(pts)


# ---------------------------------------------------------------- a01 – gabinet
def a01():
    W, H = 1600, 1000
    b = []
    b.append("<rect width='1600' height='640' fill='#9a8a70'/>")  # ściana
    b.append("<rect y='620' width='1600' height='380' fill='url(#wood)'/>")
    for x in range(0, 1600, 110):
        b.append(f"<line x1='{x}' y1='620' x2='{x-160}' y2='1000' stroke='#3b2a1c' stroke-width='3' opacity='0.5'/>")
    b.append("<rect y='610' width='1600' height='14' fill='#5b4633'/>")  # listwa
    # okno z wybitą szybą
    b.append("<rect x='420' y='110' width='240' height='320' fill='#cfd6d6' stroke='#4a3a28' stroke-width='14'/>")
    b.append("<line x1='540' y1='110' x2='540' y2='430' stroke='#4a3a28' stroke-width='10'/>")
    b.append("<polygon points='440,140 520,130 505,220 470,190 452,260' fill='#2d3233'/>")
    b.append("<polygon points='560,150 640,128 630,300 590,250 575,330 560,220' fill='#2d3233'/>")
    # sejf (h_safe 0.14,0.58 -> 224,580)
    b.append("<rect x='145' y='470' width='160' height='210' rx='6' fill='#4b4d4f' stroke='#222' stroke-width='5'/>")
    b.append("<circle cx='225' cy='560' r='30' fill='#2f3133' stroke='#999' stroke-width='4'/>")
    b.append("<rect x='280' y='540' width='12' height='60' fill='#888'/>")
    # półka (h_shelf 0.80,0.27 -> 1280,270)
    b.append("<rect x='1130' y='288' width='390' height='18' fill='#5a412b'/>")
    b.append("<rect x='1132' y='280' width='386' height='10' fill='#b3a58c' opacity='0.85'/>")  # kurz
    for dx in range(0, 380, 9):
        b.append(f"<circle cx='{1136+dx}' cy='{283 + (dx*7)%6}' r='1.4' fill='#d8cdb5'/>")
    b.append(f"<polygon points='{octagon(1280, 284, 34, 0.18)}' fill='#5a412b' stroke='#3a2a1a' stroke-width='2'/>")
    # dyplom i puchary
    b.append("<rect x='1150' y='170' width='86' height='108' fill='#e8dfc9' stroke='#6b5032' stroke-width='6'/>")
    b.append("<line x1='1165' y1='200' x2='1222' y2='200' stroke='#6b5032' stroke-width='3'/>")
    b.append("<path d='M1360 280 h40 v-12 h-8 v-30 q18 -10 18 -40 h-60 q0 30 18 40 v30 h-8z' fill='#8f7b45'/>")
    b.append("<path d='M1450 280 h34 v-10 h-7 v-24 q14 -8 14 -32 h-48 q0 24 14 32 v24 h-7z' fill='#7d6a3c'/>")
    # regał z segregatorami i luką
    b.append("<rect x='1130' y='320' width='390' height='300' fill='#4d3826'/>")
    colors = ['#2f4a6b', '#2f4a6b', '#6b2f2f', None, '#3f5b3a', '#3f5b3a', '#545454', '#2f4a6b']
    x = 1145
    for c in colors:
        if c:
            b.append(f"<rect x='{x}' y='345' width='40' height='170' fill='{c}' stroke='#1d1d1d' stroke-width='2'/>")
            b.append(f"<rect x='{x+8}' y='370' width='24' height='40' fill='#e6e0d0'/>")
        x += 46
    b.append("<rect x='1130' y='520' width='390' height='12' fill='#3a2a1c'/>")
    # biurko
    b.append("<polygon points='430,560 1170,560 1230,720 380,720' fill='#3e2c1d'/>")
    b.append("<rect x='400' y='718' width='820' height='26' fill='#2c1f14'/>")
    b.append("<rect x='420' y='744' width='40' height='200' fill='#2c1f14'/><rect x='1150' y='744' width='40' height='200' fill='#2c1f14'/>")
    # sterta papierów + kalendarz (h_papers 0.42,0.64 -> 672,640)
    for i, (dx, dy, rot) in enumerate([(-70, -10, -6), (-40, 5, 4), (-10, -6, -2), (20, 8, 7), (-55, 18, 3)]):
        b.append(f"<rect x='{620+dx}' y='{600+dy}' width='150' height='96' fill='#efe8d6' stroke='#a39a86' transform='rotate({rot} 672 640)'/>")
    b.append("<rect x='632' y='655' width='120' height='22' fill='#6b1f1f' transform='rotate(-4 672 640)'/>")
    b.append("<rect x='636' y='658' width='112' height='5' fill='#d9c9a3' transform='rotate(-4 672 640)'/>")
    # laptop i zegarek (h_valuables 0.57,0.60 -> 912,600)
    b.append("<polygon points='850,540 990,540 1000,615 840,615' fill='#2a2c2e'/>")
    b.append("<rect x='858' y='548' width='126' height='60' fill='#5e6b73'/>")
    b.append("<polygon points='830,615 1012,615 1030,640 812,640' fill='#3b3e41'/>")
    b.append("<circle cx='955' cy='657' r='15' fill='#c7a64a' stroke='#6b5520' stroke-width='5'/>")
    b.append("<rect x='952' y='668' width='7' height='20' fill='#c7a64a'/><rect x='952' y='626' width='7' height='18' fill='#c7a64a'/>")
    # kasetka (h_cashbox 0.68,0.66 -> 1088,660)
    b.append("<rect x='1040' y='640' width='100' height='46' fill='#6b6f72' stroke='#2a2a2a' stroke-width='3'/>")
    b.append("<polygon points='1040,640 1140,640 1150,600 1050,600' fill='#7d8184' stroke='#2a2a2a' stroke-width='3'/>")
    b.append("<rect x='1084' y='650' width='8' height='14' fill='#c9c9c9'/>")
    # krzesło przewrócone
    b.append("<rect x='520' y='800' width='170' height='26' fill='#2a1d12' transform='rotate(18 600 810)'/>")
    b.append("<rect x='660' y='760' width='22' height='120' fill='#2a1d12' transform='rotate(18 600 810)'/>")
    # obrys / tabliczki
    b.append(marker(330, 700, 1))
    b.append(marker(560, 470, 2))
    b.append(marker(1000, 760, 3))
    b.append(marker(1200, 700, 4))
    photo("a01.svg", W, H, "\n".join(b), "KPP ZAWIERZBIE · RSD-418/25 · FOT. 3")


# ---------------------------------------------------------------- a02 – okno z zewnątrz
def a02():
    W, H = 1600, 1000
    b = ["<rect width='1600' height='720' fill='#b9ad98'/>"]
    for y in range(40, 720, 60):
        b.append(f"<line x1='0' y1='{y}' x2='1600' y2='{y}' stroke='#a39880' stroke-width='2' opacity='0.5'/>")
    b.append("<rect x='560' y='120' width='480' height='520' fill='#3d3428' />")
    b.append("<rect x='590' y='150' width='420' height='460' fill='#262a2b'/>")
    b.append("<rect x='595' y='155' width='200' height='450' fill='#7c8a8c' opacity='0.6'/>")
    b.append("<polygon points='805,155 1005,155 1005,605 805,605 805,470 880,420 820,350 900,280 830,220' fill='#7c8a8c' opacity='0.6'/>")
    b.append("<rect x='795' y='150' width='14' height='460' fill='#3d3428'/>")
    # klamka (0.50,0.40 -> 800,400) – w pozycji zamkniętej (w dół)
    b.append("<rect x='780' y='385' width='20' height='30' rx='4' fill='#c8c2b0'/>")
    b.append("<rect x='786' y='405' width='8' height='48' rx='3' fill='#d8d2c0'/>")
    b.append("<rect x='545' y='630' width='510' height='26' fill='#8f8676'/>")  # parapet
    # rabata (0.28,0.78 -> 448,780)
    b.append("<rect y='700' width='1600' height='300' fill='#4f6040'/>")
    b.append("<ellipse cx='448' cy='790' rx='230' ry='70' fill='#4a3a2a'/>")
    b.append("<ellipse cx='448' cy='785' rx='215' ry='58' fill='#56432f'/>")
    for i in range(6):
        b.append(f"<path d='M{330+i*45} 770 q8 -40 4 -60' stroke='#384a2c' stroke-width='5' fill='none'/>")
    # szkło na trawniku (0.50,0.84 -> 800,840)
    import random
    random.seed(4)
    for _ in range(70):
        x = 800 + random.randint(-200, 200)
        y = 840 + random.randint(-80, 120)
        s = random.randint(6, 20)
        b.append(f"<polygon points='{x},{y} {x+s},{y+random.randint(-6,6)} {x+random.randint(-4,8)},{y+s}' fill='#e8f0f0' opacity='0.85' stroke='#9fb0b0'/>")
    b.append(marker(1050, 900, 5))
    photo("a02.svg", W, H, "\n".join(b), "KPP ZAWIERZBIE · RSD-418/25 · FOT. 7")


# ---------------------------------------------------------------- a03 – tylny parking
def a03():
    W, H = 1600, 1000
    b = ["<rect width='1600' height='1000' fill='#8a8574'/>"]
    b.append("<rect width='1600' height='380' fill='#c2bcab'/>")  # niebo
    b.append("<rect x='420' y='120' width='760' height='420' fill='#9b8f78'/>")  # tył budynku
    for x in range(470, 1150, 140):
        b.append(f"<rect x='{x}' y='170' width='70' height='100' fill='#4a4a44'/>")
    b.append("<rect x='760' y='360' width='90' height='180' fill='#3a342b'/>")  # tylne drzwi
    b.append("<rect x='828' y='430' width='10' height='22' fill='#aaa'/>")
    b.append("<rect x='860' y='420' width='30' height='40' fill='#2c2c2c'/><rect x='866' y='428' width='18' height='10' fill='#6c8' opacity='0.6'/>")  # czytnik
    # żwir i ślady opon (0.36,0.76 -> 576,760)
    b.append("<rect y='540' width='1600' height='460' fill='#7a7563'/>")
    import random
    random.seed(9)
    for _ in range(500):
        x = random.randint(0, 1600)
        y = random.randint(545, 1000)
        b.append(f"<circle cx='{x}' cy='{y}' r='{random.choice([1.5,2,2.5])}' fill='#5c5848'/>")
    b.append("<path d='M420 960 Q520 760 760 690' stroke='#4a4535' stroke-width='22' fill='none' opacity='0.8'/>")
    b.append("<path d='M520 980 Q610 790 830 712' stroke='#4a4535' stroke-width='22' fill='none' opacity='0.8'/>")
    # altana (0.14,0.46 -> 224,460)
    b.append("<polygon points='90,360 224,280 358,360' fill='#5b4430'/>")
    b.append("<rect x='110' y='360' width='228' height='200' fill='none' stroke='#5b4430' stroke-width='12'/>")
    b.append("<rect x='140' y='470' width='170' height='70' fill='#6d5a3c'/>")
    b.append("<path d='M140 480 q60 -30 170 0 v40 h-170z' fill='#4e5c6b'/>")
    b.append("<rect x='290' y='505' width='14' height='38' fill='#2e5b3a'/><rect x='270' y='512' width='12' height='32' fill='#2e5b3a'/>")
    # brama i niedopałki (0.83,0.70 -> 1328,700)
    b.append("<rect x='1240' y='420' width='240' height='240' fill='none' stroke='#2e2e2e' stroke-width='10'/>")
    for x in range(1260, 1480, 26):
        b.append(f"<line x1='{x}' y1='425' x2='{x}' y2='655' stroke='#2e2e2e' stroke-width='5'/>")
    b.append("<text x='1360' y='405' text-anchor='middle' " + FONT + " font-size='22' fill='#2e2e2e'>REMONT – WSTĘP WZBRONIONY</text>")
    for dx, dy in [(-12, 0), (10, 8), (2, -10)]:
        b.append(f"<rect x='{1328+dx}' y='{700+dy}' width='16' height='5' fill='#f2efe6' transform='rotate({dx*3} {1328+dx} {700+dy})'/>")
        b.append(f"<rect x='{1328+dx+12}' y='{700+dy}' width='5' height='5' fill='#c88a3a'/>")
    b.append(marker(640, 860, 8))
    photo("a03.svg", W, H, "\n".join(b), "KPP ZAWIERZBIE · RSD-418/25 · FOT. 12")


# ---------------------------------------------------------------- a04 – kalendarz
def a04():
    W, H = 1600, 1000
    b = ["<rect width='1600' height='1000' fill='#3b2b1d'/>"]
    b.append("<rect x='100' y='60' width='1400' height='880' rx='10' fill='#6b1f1f'/>")
    b.append("<rect x='120' y='80' width='675' height='840' fill='#f1ead8'/><rect x='805' y='80' width='675' height='840' fill='#f1ead8'/>")
    b.append("<line x1='800' y1='80' x2='800' y2='920' stroke='#9b8f78' stroke-width='6'/>")
    for x0 in (120, 805):
        for y in range(160, 920, 34):
            b.append(f"<line x1='{x0+20}' y1='{y}' x2='{x0+655}' y2='{y}' stroke='#c9d6e3' stroke-width='1.5'/>")

    def head(x, y, t):
        return f"<text x='{x}' y='{y}' {FONT} font-weight='700' font-size='26' fill='#6b1f1f'>{t}</text>"

    def hand(x, y, t, size=34, color='#1f2a44'):
        return f"<text x='{x}' y='{y}' {HAND} font-size='{size}' fill='{color}'>{t}</text>"

    b.append(head(150, 130, "ŚRODA 12 LISTOPADA"))
    b.append(hand(170, 260, "13:00 Lisiecki – obiad (NIE sprzedaję!)", 32))
    b.append("<line x1='520' y1='270' x2='730' y2='270' stroke='#1f2a44' stroke-width='3'/><line x1='520' y1='278' x2='730' y2='278' stroke='#1f2a44' stroke-width='3'/>")
    b.append(hand(170, 200, "Gastro-Pol – zamówienie na grudzień", 26, '#4a5160'))
    b.append(head(150, 400, "CZWARTEK 13 LISTOPADA"))
    b.append(hand(170, 520, "17:30 E. Dziedzic – faktury?? B-R / KRS", 32))
    b.append("<ellipse cx='590' cy='508' rx='38' ry='26' fill='none' stroke='#9b1c1c' stroke-width='3'/>")
    b.append(hand(170, 470, "dach – reklamacja (Bąk)", 26, '#4a5160'))
    b.append(head(150, 670, "PIĄTEK 14 LISTOPADA"))
    b.append(hand(170, 720, "gala Dworek – NIE idę", 26, '#4a5160'))
    b.append(hand(170, 790, "21:30 J.K. – faktury B-R !!", 38, '#9b1c1c'))
    b.append(head(835, 130, "SOBOTA 15 LISTOPADA"))
    b.append(hand(855, 200, "zamki skrzydło zach. – ślusarz pon.", 26, '#4a5160'))
    b.append(head(835, 330, "NIEDZIELA 16 LISTOPADA"))
    b.append(head(835, 520, "PONIEDZIAŁEK 17 LISTOPADA"))
    b.append(hand(880, 630, "10:00 Prokuratura – zawiadomienie (teczka!)", 32))
    b.append("<rect x='860' y='590' width='590' height='60' fill='none' stroke='#1f2a44' stroke-width='2' stroke-dasharray='6 5'/>")
    b.append(hand(855, 700, "zadzw. do Marty ws. ugody?", 26, '#4a5160'))
    photo("a04.svg", W, H, "\n".join(b), "KPP ZAWIERZBIE · RSD-418/25 · FOT. 15")


# ---------------------------------------------------------------- a05 – garaż (przeszukanie)
def a05():
    W, H = 1600, 1000
    b = ["<rect width='1600' height='1000' fill='#76705f'/>"]
    b.append("<rect y='760' width='1600' height='240' fill='#5b574b'/>")
    b.append("<rect x='160' y='200' width='1300' height='26' fill='#4a3a28'/><rect x='160' y='420' width='1300' height='26' fill='#4a3a28'/>")
    b.append("<rect x='160' y='690' width='1300' height='26' fill='#4a3a28'/>")
    for x in (170, 1440):
        b.append(f"<rect x='{x}' y='180' width='22' height='600' fill='#3b2e20'/>")
    # koło zapasowe
    b.append("<circle cx='330' cy='580' r='110' fill='#1e1e1e'/><circle cx='330' cy='580' r='55' fill='#7d7d7d'/>")
    # puszki, kartony
    b.append("<rect x='1180' y='330' width='120' height='90' fill='#a58a5c'/><rect x='1320' y='350' width='70' height='70' fill='#5f6f84'/>")
    # ręcznik (0.40,0.66 -> 640,660)
    b.append("<path d='M480 690 L520 560 Q700 520 900 560 L960 690 Z' fill='#f4f2ee' stroke='#cfcac0' stroke-width='3'/>")
    for y in range(580, 690, 14):
        b.append(f"<line x1='520' y1='{y}' x2='930' y2='{y}' stroke='#e2ded6' stroke-width='3'/>")
    b.append(f"<text x='640' y='668' text-anchor='middle' {HAND} font-size='26' fill='#6b8a5a'>Pod Lipami</text>")
    # statuetka (podstawa 0.55,0.56 -> 880,560)
    b.append(f"<polygon points='{octagon(880, 580, 70, 0.35)}' fill='#a88a3c' stroke='#5c4a1c' stroke-width='3'/>")
    b.append("<rect x='812' y='540' width='136' height='40' fill='#b8973f'/>")
    b.append(f"<polygon points='{octagon(880, 540, 70, 0.35)}' fill='#c9a84d' stroke='#5c4a1c' stroke-width='3'/>")
    b.append("<rect x='868' y='380' width='24' height='160' fill='#b8973f'/>")
    b.append("<ellipse cx='880' cy='330' rx='90' ry='75' fill='#c9a84d' stroke='#5c4a1c' stroke-width='3'/>")
    b.append("<ellipse cx='840' cy='310' rx='40' ry='30' fill='#d8bb62'/><ellipse cx='920' cy='345' rx='35' ry='26' fill='#d8bb62'/>")
    b.append("<path d='M820 560 q10 18 0 30 M840 568 q6 14 -2 24' stroke='#3a1a12' stroke-width='6' fill='none'/>")
    b.append("<rect x='846' y='548' width='68' height='16' fill='#e8dcb0'/>")
    b.append(marker(1060, 640, 1))
    photo("a05.svg", W, H, "\n".join(b), "KPP ZAWIERZBIE · RSD-418/25 · PRZESZUKANIE · FOT. 2")


# ---------------------------------------------------------------- monitoring
def cctv(name, label, ts, body, night=True):
    W, H = 1600, 900
    tint = '#0f1a14' if night else '#2a3a30'
    svg = f"""<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 {W} {H}' width='{W}' height='{H}'>
<defs>
  <filter id='cam'>
    <feColorMatrix type='matrix' values='0.25 0.45 0.1 0 0.02  0.3 0.55 0.12 0 0.05  0.2 0.4 0.08 0 0.02  0 0 0 1 0'/>
  </filter>
  <filter id='noise' x='0' y='0' width='100%' height='100%'>
    <feTurbulence type='fractalNoise' baseFrequency='1.2' numOctaves='1' seed='3' result='n'/>
    <feColorMatrix type='saturate' values='0' in='n' result='g'/>
    <feComponentTransfer in='g' result='ga'><feFuncA type='linear' slope='0.22'/></feComponentTransfer>
    <feBlend in='SourceGraphic' in2='ga' mode='screen'/>
  </filter>
  <pattern id='scan' width='4' height='4' patternUnits='userSpaceOnUse'><rect width='4' height='2' fill='#000' opacity='0.18'/></pattern>
  <radialGradient id='cvig' cx='50%' cy='50%' r='70%'><stop offset='60%' stop-opacity='0'/><stop offset='100%' stop-color='#000' stop-opacity='0.7'/></radialGradient>
</defs>
<rect width='{W}' height='{H}' fill='{tint}'/>
<g filter='url(#cam)'><g filter='url(#noise)'>{body}</g></g>
<rect width='{W}' height='{H}' fill='url(#scan)'/>
<rect width='{W}' height='{H}' fill='url(#cvig)'/>
<text x='30' y='50' {MONO} font-size='30' fill='#d8f5d0'>{label}</text>
<text x='{W-30}' y='50' text-anchor='end' {MONO} font-size='30' fill='#d8f5d0'>14-11-2025 {ts}</text>
</svg>"""
    (OUT / name).write_text(svg, encoding="utf-8")


def hotel_scene(lit=True):
    b = ["<rect width='1600' height='900' fill='#1d2722'/>"]
    b.append("<rect width='1600' height='300' fill='#141a17'/>")
    b.append("<rect x='0' y='60' width='700' height='300' fill='#3a3f38'/>")  # fasada
    for x in range(40, 680, 120):
        b.append(f"<rect x='{x}' y='110' width='60' height='80' fill='#1a1e1b'/>")
    if lit:
        b.append("<rect x='40' y='230' width='70' height='90' fill='#e8e2a0'/>")  # okno gabinetu (parter)
    b.append("<rect x='300' y='240' width='140' height='120' fill='#202520'/>")
    b.append("<text x='370' y='225' text-anchor='middle' " + FONT + " font-size='26' fill='#c9cfb0'>POD LIPAMI</text>")
    b.append("<polygon points='0,900 1600,900 1600,380 0,430' fill='#2d332d'/>")
    for i in range(6):
        x = 250 + i * 220
        b.append(f"<line x1='{x}' y1='{440 - i*5}' x2='{x - 160}' y2='900' stroke='#c8ccb5' stroke-width='5' opacity='0.6'/>")
    b.append("<circle cx='1450' cy='330' r='28' fill='#f2eec0' opacity='0.8'/><rect x='1444' y='330' width='12' height='300' fill='#555'/>")
    return b


def small_car(x, y, plate="", color='#e6e6e0', scale=1.0, lights=True):
    s = scale
    out = [f"<g transform='translate({x} {y}) scale({s})'>",
           f"<rect x='-120' y='-40' width='240' height='80' rx='26' fill='{color}'/>",
           f"<path d='M-80 -40 Q-60 -95 0 -95 Q60 -95 80 -40 Z' fill='{color}'/>",
           "<path d='M-60 -45 Q-45 -85 0 -85 Q45 -85 60 -45 Z' fill='#2f3a36'/>",
           "<circle cx='-70' cy='42' r='26' fill='#111'/><circle cx='70' cy='42' r='26' fill='#111'/>"]
    if lights:
        out.append("<rect x='-118' y='-20' width='22' height='16' fill='#ff6b5a'/><rect x='96' y='-20' width='22' height='16' fill='#ff6b5a'/>")
    if plate:
        out.append("<rect x='-46' y='8' width='92' height='22' fill='#f2f2f2' stroke='#333'/>")
        out.append(f"<text x='0' y='25' text-anchor='middle' {MONO} font-size='16' font-weight='700' fill='#111'>{plate}</text>")
    out.append("</g>")
    return "".join(out)


def van(x, y, text="BĄK-REMONTY", scale=1.0):
    return (f"<g transform='translate({x} {y}) scale({scale})'>"
            "<rect x='-200' y='-110' width='400' height='170' rx='14' fill='#e8e8e2'/>"
            "<rect x='120' y='-150' width='100' height='120' rx='12' fill='#e8e8e2'/>"
            "<rect x='140' y='-135' width='70' height='55' fill='#2c3631'/>"
            f"<text x='-40' y='-30' text-anchor='middle' {FONT} font-weight='700' font-size='40' fill='#1d3a6b'>{text}</text>"
            "<circle cx='-120' cy='65' r='34' fill='#111'/><circle cx='130' cy='65' r='34' fill='#111'/></g>")


def person(x, y, coat='#b9b9a8'):
    return (f"<g transform='translate({x} {y})'><circle cx='0' cy='-120' r='22' fill='#cfcfc0'/>"
            f"<path d='M-30 -95 L30 -95 L40 20 L-40 20 Z' fill='{coat}'/>"
            "<rect x='-26' y='20' width='18' height='70' fill='#333'/><rect x='8' y='20' width='18' height='70' fill='#333'/></g>")


def cctv_all():
    b = hotel_scene(lit=False)
    b.append(small_car(672, 600, plate="TZA 47816"[:6] + "…", scale=0.95))
    cctv("c01.svg", "CAM-1 PARKING", "18:31:05", "".join(b), night=False)

    b = hotel_scene(lit=True)
    b.append(person(1180, 640))
    cctv("c02.svg", "CAM-1 PARKING", "20:05:40", "".join(b))

    b = hotel_scene(lit=True)
    b.append(van(880, 560))
    b.append(person(1120, 620, coat='#6b6b5a'))
    cctv("c03.svg", "CAM-1 PARKING", "21:28:12", "".join(b))

    b = hotel_scene(lit=True)
    b.append(van(1300, 520, scale=0.8))
    cctv("c04.svg", "CAM-1 PARKING", "21:41:30", "".join(b))

    b = hotel_scene(lit=True)
    cctv("c05.svg", "CAM-1 PARKING", "23:58:00", "".join(b))

    def street():
        s = ["<rect width='1600' height='900' fill='#18201c'/>"]
        s.append("<rect y='380' width='1600' height='300' fill='#262d29'/>")
        s.append("<line x1='0' y1='530' x2='1600' y2='530' stroke='#c9cfb0' stroke-width='6' stroke-dasharray='60 40'/>")
        s.append("<rect y='680' width='1600' height='220' fill='#202622'/>")
        s.append("<rect x='60' y='700' width='260' height='160' fill='#2d3a33'/><text x='190' y='790' text-anchor='middle' " + FONT + " font-size='40' font-weight='700' fill='#c9d6b0'>ORLEN</text>")
        s.append("<rect x='1300' y='120' width='14' height='260' fill='#444'/><circle cx='1307' cy='110' r='24' fill='#f0eebb' opacity='0.7'/>")
        return s

    b = street()
    b.append(van(800, 480, scale=0.85))
    cctv("c06.svg", "ORLEN-K3 WISLANA", "21:46:18", "".join(b))

    b = street()
    b.append(small_car(752, 560, plate="TZA 47…", scale=0.9))
    cctv("c07.svg", "ORLEN-K3 WISLANA", "22:09:51", "".join(b))

    b = street()
    b.append(small_car(500, 470, color='#b8b8a8', scale=0.9))
    b.append("<rect x='470' y='358' width='60' height='18' fill='#e8e2a0'/><text x='500' y='372' text-anchor='middle' " + FONT + " font-size='12' fill='#111'>TAXI</text>")
    cctv("c08.svg", "ORLEN-K3 WISLANA", "22:31:07", "".join(b))

    b = street()
    cctv("c09.svg", "ORLEN-K3 WISLANA", "23:20:44", "".join(b))

    def manor():
        s = ["<rect width='1600' height='900' fill='#1a211d'/>"]
        s.append("<rect x='300' y='60' width='1000' height='260' fill='#4a4f46'/>")
        for x in range(340, 1280, 110):
            s.append(f"<rect x='{x}' y='110' width='50' height='120' fill='#e8e2a0' opacity='0.8'/>")
        s.append("<polygon points='300,60 800,0 1300,60' fill='#3a3f38'/>")
        s.append("<rect y='420' width='1600' height='480' fill='#262d29'/>")
        for i in range(7):
            s.append(f"<line x1='{120+i*210}' y1='460' x2='{60+i*210}' y2='900' stroke='#c8ccb5' stroke-width='4' opacity='0.5'/>")
        s.append(small_car(300, 760, color='#2a2f2c', scale=0.9, lights=False))
        s.append(small_car(1250, 760, color='#3a3d3a', scale=0.9, lights=False))
        return s

    def audi(x, y):
        return small_car(x, y, color='#232826', scale=1.1)

    b = manor()
    b.append(audi(800, 580))
    cctv("c10.svg", "DW-PARK", "21:39:44", "".join(b))
    b = manor()
    b.append(audi(780, 600))
    b.append(person(950, 650, coat='#141414'))
    cctv("c11.svg", "DW-PARK", "22:11:02", "".join(b))
    b = manor()
    for i, x in enumerate([600, 700, 820, 950, 1050]):
        b.append(person(x, 520 + (i % 2) * 20, coat=['#141414', '#5a4a3a', '#141414', '#6b6b5a', '#141414'][i]))
    cctv("c12.svg", "DW-PARK", "23:31:15", "".join(b))


if __name__ == "__main__":
    a01(); a02(); a03(); a04(); a05(); cctv_all()
    print("Zapisano:", ", ".join(sorted(p.name for p in OUT.glob("*.svg"))))

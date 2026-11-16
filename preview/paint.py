"""Paints the cell grids render.ts wrote as PNG images, one per card.

usage: python3 paint.py <cards.json> <out dir>

Lines, corners and blocks are drawn as shapes, the way a terminal draws them,
so they join exactly; everything else comes from system fonts.
"""
import json
import os
import sys

from PIL import Image, ImageDraw, ImageFont

BG = (23, 25, 29)
FG = (210, 212, 217)
THEME = {
    'text': (255, 255, 255), 'inverseText': (0, 0, 0), 'inactive': (153, 153, 153), 'subtle': (80, 80, 80),
    'suggestion': (177, 185, 249), 'success': (78, 186, 101), 'error': (255, 107, 128), 'warning': (255, 193, 7),
    'claude': (215, 119, 87), 'permission': (177, 185, 249), 'planMode': (72, 150, 140), 'ide': (71, 130, 200),
    'bashBorder': (253, 93, 177), 'autoAccept': (175, 135, 255),
}
SIZE, CW, CH, PAD = 26, 16, 34, 28
F = '/System/Library/Fonts/'
MONO = ImageFont.truetype(F + 'Menlo.ttc', SIZE, index=0)
MONO_BOLD = ImageFont.truetype(F + 'Menlo.ttc', SIZE, index=1)
CJK = ImageFont.truetype(F + 'Hiragino Sans GB.ttc', SIZE - 2, index=0)
CJK_BOLD = ImageFont.truetype(F + 'Hiragino Sans GB.ttc', SIZE - 2, index=1)
EXTRA = [ImageFont.truetype(F + 'Apple Symbols.ttf', SIZE), ImageFont.truetype(F + 'Supplemental/Arial Unicode.ttf', SIZE - 4)]
_missing = {}


def has(font, ch):
    key = id(font)
    if key not in _missing:
        _missing[key] = bytes(font.getmask('￿'))
    mask = font.getmask(ch)
    return mask.getbbox() is not None and bytes(mask) != _missing[key]


def blend(color, toward, amount):
    return tuple(round(c + (t - c) * amount) for c, t in zip(color, toward))


LIGHT = {'─': 'LR', '│': 'UD', '┌': 'DR', '┐': 'DL', '└': 'UR', '┘': 'UL', '├': 'UDR', '┤': 'UDL', '┬': 'DLR', '┴': 'ULR', '┼': 'UDLR'}
HEAVY = {'━': 'LR', '┃': 'UD', '┏': 'DR', '┓': 'DL', '┗': 'UR', '┛': 'UL', '┣': 'UDR', '┫': 'UDL', '┳': 'DLR', '┻': 'ULR', '╋': 'UDLR'}
ROUND = {'╭': (1, 1, 180, 270), '╮': (-1, 1, 270, 360), '╰': (1, -1, 90, 180), '╯': (-1, -1, 0, 90)}
LEFT_PART = {'▉': 7, '▊': 6, '▋': 5, '▌': 4, '▍': 3, '▎': 2, '▏': 1}
LOW_PART = {'▁': 1, '▂': 2, '▃': 3, '▄': 4, '▅': 5, '▆': 6, '▇': 7}
SHADE = {'░': 0.72, '▒': 0.5, '▓': 0.25}


def strokes(draw, sides, x, y, color, t):
    cx, cy, h = x + CW // 2, y + CH // 2, t // 2
    if 'L' in sides:
        draw.rectangle([x, cy - h, cx + h - 1, cy + h - 1], fill=color)
    if 'R' in sides:
        draw.rectangle([cx - h, cy - h, x + CW - 1, cy + h - 1], fill=color)
    if 'U' in sides:
        draw.rectangle([cx - h, y, cx + h - 1, cy + h - 1], fill=color)
    if 'D' in sides:
        draw.rectangle([cx - h, cy - h, cx + h - 1, y + CH - 1], fill=color)


def shape(draw, ch, x, y, color):
    """Draws ch as a shape; False where it is left to a font."""
    cx, cy = x + CW // 2, y + CH // 2
    if ch in LIGHT:
        strokes(draw, LIGHT[ch], x, y, color, 2)
    elif ch in HEAVY:
        strokes(draw, HEAVY[ch], x, y, color, 4)
    elif ch in ROUND:
        sx, sy, start, end = ROUND[ch]
        r = CW // 2
        ox, oy = cx + sx * r, cy + sy * r
        draw.arc([ox - r, oy - r, ox + r, oy + r], start, end, fill=color, width=2)
        draw.rectangle([cx - 1, min(cy + sy * r, y + (CH - 1 if sy > 0 else 0)), cx, max(cy + sy * r, y + (CH - 1 if sy > 0 else 0))], fill=color)
    elif ch in '═║╔╗╚╝╤╧':
        o = 3
        if ch in '═╤╧':
            for dy in (-o, o):
                draw.rectangle([x, cy + dy - 1, x + CW - 1, cy + dy], fill=color)
            if ch == '╤':
                draw.rectangle([cx - 1, cy + o, cx, y + CH - 1], fill=color)
            if ch == '╧':
                draw.rectangle([cx - 1, y, cx, cy - o], fill=color)
        elif ch == '║':
            for dx in (-o, o):
                draw.rectangle([cx + dx - 1, y, cx + dx, y + CH - 1], fill=color)
        else:
            sx = 1 if ch in '╔╚' else -1  # the side the horizontal runs to
            sy = 1 if ch in '╔╗' else -1  # the side the vertical runs to
            for k in (-o, o):  # outer then inner elbow
                vx, hy = cx + k * -sx, cy + k * -sy
                draw.rectangle(sorted_box(vx - 1, hy - 1, vx, y + CH - 1 if sy > 0 else y), fill=color)
                draw.rectangle(sorted_box(vx - 1, hy - 1, x + CW - 1 if sx > 0 else x, hy), fill=color)
    elif ch in '┄╌':
        for i in range(3):
            draw.rectangle([x + 1 + i * 5, cy - 1, x + 3 + i * 5, cy], fill=color)
    elif ch == '┆':
        for i in range(3):
            draw.rectangle([cx - 1, y + 3 + i * 11, cx, y + 9 + i * 11], fill=color)
    elif ch == '╱':
        draw.line([x, y + CH - 1, x + CW - 1, y], fill=color, width=2)
    elif ch == '╲':
        draw.line([x, y, x + CW - 1, y + CH - 1], fill=color, width=2)
    elif ch == '█':
        draw.rectangle([x, y, x + CW - 1, y + CH - 1], fill=color)
    elif ch in LEFT_PART:
        draw.rectangle([x, y, x + round(CW * LEFT_PART[ch] / 8) - 1, y + CH - 1], fill=color)
    elif ch in LOW_PART:
        draw.rectangle([x, y + CH - round(CH * LOW_PART[ch] / 8), x + CW - 1, y + CH - 1], fill=color)
    elif ch in SHADE:
        draw.rectangle([x, y, x + CW - 1, y + CH - 1], fill=blend(color, BG, SHADE[ch]))
    elif ch in '▼▲▶◀':
        a = 6
        points = {
            '▼': [(cx - a, cy - 4), (cx + a, cy - 4), (cx, cy + 6)], '▲': [(cx - a, cy + 4), (cx + a, cy + 4), (cx, cy - 6)],
            '▶': [(x + 2, cy - a), (x + 2, cy + a), (x + CW - 2, cy)], '◀': [(x + CW - 2, cy - a), (x + CW - 2, cy + a), (x + 2, cy)],
        }[ch]
        draw.polygon(points, fill=color)
    elif ch == '●':
        draw.ellipse([cx - 6, cy - 6, cx + 5, cy + 5], fill=color)
    elif ch == '○':
        draw.ellipse([cx - 6, cy - 6, cx + 5, cy + 5], outline=color, width=2)
    elif ch == '◆':
        draw.polygon([(cx, cy - 8), (cx + 7, cy), (cx, cy + 8), (cx - 7, cy)], fill=color)
    elif ch == '■':
        draw.rectangle([cx - 6, cy - 6, cx + 5, cy + 5], fill=color)
    elif ch == '•':
        draw.ellipse([cx - 3, cy - 3, cx + 3, cy + 3], fill=color)
    elif ch == '·':
        draw.ellipse([cx - 2, cy - 2, cx + 1, cy + 1], fill=color)
    else:
        return False
    return True


def sorted_box(x1, y1, x2, y2):
    return [min(x1, x2), min(y1, y2), max(x1, x2), max(y1, y2)]


def paint(card, path, lit=''):
    """Paints one card; cells of the hover group `lit` are drawn as hovered."""
    lines = card['lines']
    cols = max((sum(cell[1] for cell in line) for line in lines), default=1)
    width, height = cols * CW + 2 * PAD, len(lines) * CH + 2 * PAD
    image = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle([0, 0, width - 1, height - 1], radius=18, fill=BG)
    for row, line in enumerate(lines):
        col = 0
        y = PAD + row * CH
        for ch, wide, fg, flags, *rest in line:
            x = PAD + col * CW
            col += wide
            if lit and rest and rest[0] == lit:
                fg, flags = 'text', (flags | 1) & ~2
            color = THEME.get(fg, FG) if fg else FG
            if flags & 2:
                color = blend(color, BG, 0.45)
            if flags & 4:
                draw.rectangle([x, y + 2, x + wide * CW - 1, y + CH - 3], fill=color)
                color = BG
            if ch == ' ':
                continue
            if not shape(draw, ch, x, y, color):
                bold = bool(flags & 1)
                if wide == 2:
                    font = CJK_BOLD if bold else CJK
                    if not has(font, ch):
                        font = next((f for f in EXTRA if has(f, ch)), font)
                else:
                    font = MONO_BOLD if bold else MONO
                    if not has(font, ch):
                        font = next((f for f in EXTRA + [CJK] if has(f, ch)), font)
                advance = font.getlength(ch)
                draw.text((x + (wide * CW - advance) / 2, y + round(CH * 0.74)), ch, font=font, fill=color, anchor='ls')
            if flags & 8:
                draw.rectangle([x, y + CH - 5, x + wide * CW - 1, y + CH - 4], fill=color)
    if path is None:
        return image
    image.save(path)
    return width, height


if __name__ != '__main__':
    pass
elif sys.argv[1].endswith('.frames.json'):
    # An animation: frames.ts wrote [{ card, ms, lit }], painted into one GIF.
    frames = json.load(open(sys.argv[1], encoding='utf-8'))
    images = [paint(frame['card'], None, frame.get('lit', '')) for frame in frames]
    width = max(image.width for image in images)
    height = max(image.height for image in images)
    scale = float(os.environ.get('SKETCH_GIF_SCALE', '0.6'))
    size = (round(width * scale), round(height * scale))
    stills = []
    for image in images:
        canvas = Image.new('RGB', (width, height), (36, 36, 40))
        canvas.paste(image, (0, 0), image)
        stills.append(canvas.resize(size, Image.LANCZOS).convert('P', palette=Image.ADAPTIVE, colors=64))
    stills[0].save(sys.argv[2], save_all=True, append_images=stills[1:], duration=[frame['ms'] for frame in frames], loop=0, optimize=True, disposal=2)
    print(sys.argv[2], len(stills), 'frames', size)
    sys.exit(0)

cards = json.load(open(sys.argv[1], encoding='utf-8'))
os.makedirs(sys.argv[2], exist_ok=True)
for card in cards:
    name = card['key'] + '.png'
    size = paint(card, os.path.join(sys.argv[2], name))
    print(name, size, card['title'])

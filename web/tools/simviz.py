# シミュレーションのスナップショットを上から見た図にして並べる
import json, sys, math
from PIL import Image, ImageDraw, ImageFont
frames = json.load(open(sys.argv[1]))
out = sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 4
S = 4.2  # px per meter
W, H = int(115 * S), int(78 * S)
font = ImageFont.truetype('/usr/share/fonts/truetype/fonts-japanese-gothic.ttf', 11)
def P(x, z): return (W / 2 + x * S, H / 2 + z * S)
imgs = []
for fr in frames:
    im = Image.new('RGB', (W, H + 40), (30, 90, 40))
    d = ImageDraw.Draw(im)
    x0, z0 = P(-52.5, -34); x1, z1 = P(52.5, 34)
    d.rectangle([x0, z0, x1, z1], outline='white')
    d.line([P(0, -34), P(0, 34)], fill='white')
    for sx in (-1, 1):
        a, b = P(sx * 52.5, -20.16), P(sx * (52.5 - 16.5), 20.16)
        d.rectangle([min(a[0], b[0]), a[1], max(a[0], b[0]), b[1]], outline='white')
        g1, g2 = P(sx * 52.5, -3.66), P(sx * 54.5, 3.66)
        d.rectangle([min(g1[0], g2[0]), g1[1], max(g1[0], g2[0]), g2[1]], outline='yellow')
    for p in fr['players']:
        c = (40, 90, 230) if p['team'] == 0 else (230, 50, 50)
        x, y = P(p['x'], p['z'])
        tx, ty = P(p['tx'], p['tz'])
        d.line([x, y, tx, ty], fill=(c[0]//2+60, c[1]//2+60, c[2]//2+60))
        d.ellipse([x - 5, y - 5, x + 5, y + 5], fill=c, outline='white' if fr['owner'] == p['id'] else c)
        d.line([x, y, x + math.cos(p['f']) * 9, y + math.sin(p['f']) * 9], fill='white')
        lab = f"{p['n']}{p['r']}" + ('' if p['st'] == 'move' else ':' + p['st'][:3])
        d.text((x + 6, y - 6), lab, fill='white', font=font)
    bx, by = P(fr['ball'][0], fr['ball'][1])
    r = 3 + fr['ball'][2] * 0.8
    d.ellipse([bx - r, by - r, bx + r, by + r], fill='yellow', outline='black')
    d.text((4, H + 2), f"t={fr['t']} {fr['phase']} owner={fr['owner']} pt={fr['pt']}", fill='white', font=font)
    d.text((4, H + 18), ' | '.join(fr['ev'])[:110], fill=(255, 230, 120), font=font)
    imgs.append(im)
rows = math.ceil(len(imgs) / cols)
sheet = Image.new('RGB', (cols * W, rows * (H + 40)), (0, 0, 0))
for i, im in enumerate(imgs):
    sheet.paste(im, ((i % cols) * W, (i // cols) * (H + 40)))
sheet.save(out)
print(sheet.size)

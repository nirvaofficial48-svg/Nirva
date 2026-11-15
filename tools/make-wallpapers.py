# Draws the wallpaper scene SVGs. Usage: python3 tools/make-wallpapers.py firefox/browser/themes/shared/nirva
import math, random, sys
out = sys.argv[1]
HDR = '<!-- This Source Code Form is subject to the terms of the Mozilla Public\n   - License, v. 2.0. If a copy of the MPL was not distributed with this\n   - file, You can obtain one at http://mozilla.org/MPL/2.0/. -->\n'
W = 1600
def f(v): return ('%.1f' % v).rstrip('0').rstrip('.')

def pine(x, base, h, w):
    tiers = 4
    pts = [(x, base - h)]
    for i in range(1, tiers + 1):
        y = base - h + h * i / tiers * (0.92 if i < tiers else 1.0)
        pts.append((x + w * i / tiers, y))
        if i < tiers:
            pts.append((x + w * i / tiers * 0.42, y - h * 0.05))
    pts.append((x + w * 0.09, base - h * 0.06))
    pts.append((x + w * 0.09, base + 2))
    pts.append((x - w * 0.09, base + 2))
    pts.append((x - w * 0.09, base - h * 0.06))
    for i in range(tiers, 0, -1):
        y = base - h + h * i / tiers * (0.92 if i < tiers else 1.0)
        if i < tiers:
            pts.append((x - w * i / tiers * 0.42, y - h * 0.05))
        pts.append((x - w * i / tiers, y))
    return 'M' + ' '.join(f(a) + ',' + f(b) for a, b in pts) + 'Z'

def treeline(seed, base, hmin, hmax, step):
    rnd = random.Random(seed)
    d = []
    x = 0
    while x < W:
        h = rnd.uniform(hmin, hmax)
        w = h * rnd.uniform(0.22, 0.3)
        b = base + 8 * math.sin(2 * math.pi * x / W * 2 + seed)
        for dx in (0, -W, W):
            if -w <= x + dx <= W + w:
                d.append(pine(x + dx, b, h, w))
        x += step * rnd.uniform(0.55, 1.1)
    ground = 'M0,%s ' % f(base) + ' '.join('L%s,%s' % (f(i), f(base + 8 * math.sin(2 * math.pi * i / W * 2 + seed))) for i in range(0, W + 1, 40)) + ' L%d,400 L0,400Z' % W
    return ''.join(d) + ground

pines = HDR + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 400" preserveAspectRatio="xMidYMax slice">' \
    '<path fill="context-fill" fill-opacity="0.55" d="%s"/>' % treeline(3, 300, 90, 170, 34) + \
    '<path fill="context-fill" d="%s"/>' % treeline(7, 340, 120, 230, 46) + \
    '<path fill="context-stroke" d="%s"/></svg>\n' % treeline(11, 384, 150, 300, 70)
open(out + '/wall-pines.svg', 'w').write(pines)

def ridge(seed, base, amp, harmonics):
    rnd = random.Random(seed)
    comps = [(k, rnd.uniform(0, 2 * math.pi), amp / (k ** 0.9)) for k in harmonics]
    pts = []
    for i in range(0, W + 1, 10):
        y = base + sum(a * math.sin(2 * math.pi * k * i / W + p) for k, p, a in comps)
        pts.append((i, y))
    return pts

def area(pts): return 'M0,400 ' + ' '.join('L%s,%s' % (f(a), f(b)) for a, b in pts) + ' L%d,400Z' % W
def line(pts): return 'M' + ' L'.join('%s,%s' % (f(a), f(b)) for a, b in pts)

r = [ridge(2, 170, 42, (1, 2, 3, 5)), ridge(5, 230, 36, (1, 2, 4, 6)), ridge(9, 290, 30, (1, 3, 5, 7)), ridge(13, 345, 22, (2, 3, 6, 9))]
hills = HDR + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 400" preserveAspectRatio="xMidYMax slice">' + \
    '<path fill="context-fill" fill-opacity="0.35" d="%s"/>' % area(r[0]) + \
    '<path fill="context-fill" fill-opacity="0.6" d="%s"/>' % area(r[1]) + \
    '<path fill="context-fill" d="%s"/>' % area(r[2]) + \
    '<path fill="context-stroke" d="%s"/></svg>\n' % area(r[3])
open(out + '/wall-hills.svg', 'w').write(hills)

lines = HDR + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 400" preserveAspectRatio="xMidYMax slice" fill="none" stroke="context-stroke" stroke-width="1">' + \
    ''.join('<path vector-effect="non-scaling-stroke" stroke-opacity="%s" d="%s"/>' % (o, line(p)) for o, p in zip((0.35, 0.55, 0.75, 1), r)) + \
    '<path vector-effect="non-scaling-stroke" stroke="context-fill" d="M0,399.5 L1600,399.5"/></svg>\n'
open(out + '/wall-ridges.svg', 'w').write(lines)

# Topographic contours: a field that repeats every 800 x 600, traced with marching squares.
CW, CH, N = 800, 600, 8
def field(x, y):
    u, v = 2 * math.pi * x / CW, 2 * math.pi * y / CH
    return (math.sin(u + 0.6) * math.cos(v) + 0.6 * math.sin(2 * u + 2 * v + 1.3)
            + 0.45 * math.cos(3 * u - v + 0.4) + 0.35 * math.sin(u - 2 * v + 2.1))
nx, ny = CW // N, CH // N
g = [[field(i * N, j * N) for i in range(nx + 1)] for j in range(ny + 1)]
segs = {}
levels = [l / 3 for l in range(-7, 8)]
for li, lv in enumerate(levels):
    out_s = []
    for j in range(ny):
        for i in range(nx):
            c = [(i, j), (i + 1, j), (i + 1, j + 1), (i, j + 1)]
            vals = [g[b][a] for a, b in c]
            pts = []
            for k in range(4):
                a, b = c[k], c[(k + 1) % 4]
                va, vb = vals[k], vals[(k + 1) % 4]
                if (va < lv) != (vb < lv):
                    t = (lv - va) / (vb - va)
                    pts.append(((a[0] + (b[0] - a[0]) * t) * N, (a[1] + (b[1] - a[1]) * t) * N))
            if len(pts) >= 2:
                out_s.append('M%s,%sL%s,%s' % (f(pts[0][0]), f(pts[0][1]), f(pts[1][0]), f(pts[1][1])))
            if len(pts) == 4:
                out_s.append('M%s,%sL%s,%s' % (f(pts[2][0]), f(pts[2][1]), f(pts[3][0]), f(pts[3][1])))
    segs[li] = ''.join(out_s)
cont = HDR + '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" fill="none" stroke-width="1">' + \
    ''.join('<path stroke="%s" d="%s"/>' % ('context-stroke' if li % 3 == 0 else 'context-fill', d) for li, d in segs.items() if d) + '</svg>\n'
open(out + '/wall-contours.svg', 'w').write(cont)

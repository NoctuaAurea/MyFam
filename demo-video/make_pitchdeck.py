#!/usr/bin/env python3
"""MyFam Pitch Deck — 6 slides, widescreen 16:9"""

import os, math
from io import BytesIO
from reportlab.pdfgen import canvas
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor, white, black
from reportlab.lib.utils import ImageReader
from reportlab.platypus import Paragraph
from reportlab.lib.styles import ParagraphStyle
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
import matplotlib.patches as mpatches
import numpy as np
from PIL import Image

# ── Brand palette ─────────────────────────────────────────────────────────────
BG      = HexColor('#0E211C')
SURFACE = HexColor('#15241F')
UP      = HexColor('#1E2F29')
BORDER  = HexColor('#253D35')
TEXT    = HexColor('#EAF2ED')
SOFT    = HexColor('#8AA398')
GREEN   = HexColor('#3FB985')
GOLD    = HexColor('#E8B24C')
DIMMED  = HexColor('#4A6E60')

# ── Slide dimensions (16:9 at 96 dpi equivalent) ─────────────────────────────
W = 13.33 * inch   # ≈ 960 pt
H = 7.50  * inch   # ≈ 540 pt

DIR  = "/Users/jasonvandijk/Documents/MyFam/demo-video"
OUT  = os.path.join(DIR, "myfam_pitchdeck.pdf")
TOTAL = 6

# ── Helpers ───────────────────────────────────────────────────────────────────
def bg(c, col=None):
    c.setFillColor(col or BG)
    c.rect(0, 0, W, H, fill=1, stroke=0)

def txt(c, s, x, y, size=14, color=TEXT, font='Helvetica-Bold', align='left'):
    c.setFont(font, size)
    c.setFillColor(color)
    if align == 'center': c.drawCentredString(x, y, s)
    elif align == 'right': c.drawRightString(x, y, s)
    else:                  c.drawString(x, y, s)

def bar(c, x, y, w, h, col=GREEN, r=3):
    c.setFillColor(col)
    c.roundRect(x, y, w, h, r, fill=1, stroke=0)

def divider(c, x, y, w, col=BORDER):
    c.setStrokeColor(col)
    c.setLineWidth(0.5)
    c.line(x, y, x + w, y)

def pgnum(c, n):
    txt(c, f'{n} / {TOTAL}', W - 0.35*inch, 0.22*inch, size=9, color=DIMMED,
        font='Helvetica', align='right')

def logo_mark(c, cx, cy, r=22):
    """Vector tree-mark logo."""
    ox, oy = cx, cy
    # trunk line up
    c.setStrokeColor(GREEN); c.setLineWidth(1.8)
    c.line(ox, oy + r*0.15, ox, oy + r*0.55)
    # branches
    c.line(ox, oy + r*0.22, ox - r*0.35, oy - r*0.05)
    c.line(ox, oy + r*0.22, ox + r*0.35, oy - r*0.05)
    # circles
    c.setFillColor(GOLD);  c.circle(ox,           oy + r*0.55, r*0.14, fill=1, stroke=0)
    c.setFillColor(GREEN); c.circle(ox - r*0.35,  oy - r*0.05, r*0.11, fill=1, stroke=0)
    c.setFillColor(GREEN); c.circle(ox + r*0.35,  oy - r*0.05, r*0.11, fill=1, stroke=0)

def img(c, path, x, y, w, h, radius=8):
    """Draw image with rounded-corner mask via clipping."""
    try:
        reader = ImageReader(path)
        c.saveState()
        p = c.beginPath()
        p.roundRect(x, y, w, h, radius)
        c.clipPath(p, stroke=0)
        c.drawImage(reader, x, y, w, h, preserveAspectRatio=True, anchor='c', mask='auto')
        c.restoreState()
    except Exception as e:
        # Fallback: grey placeholder
        c.setFillColor(UP)
        c.roundRect(x, y, w, h, radius, fill=1, stroke=0)
        txt(c, '[ image ]', x + w/2, y + h/2, size=10, color=DIMMED, align='center')

def bullet(c, items, x, y, size=13.5, gap=26, color=TEXT, dot=GREEN):
    for i, item in enumerate(items):
        yy = y - i * gap
        c.setFillColor(dot)
        c.circle(x - 10, yy + 4, 3, fill=1, stroke=0)
        txt(c, item, x, yy, size=size, color=color, font='Helvetica')

def tag(c, label, x, y, bg_col=GREEN, fg=BG):
    pad_h, pad_v = 8, 4
    c.setFont('Helvetica-Bold', 10)
    tw = c.stringWidth(label, 'Helvetica-Bold', 10)
    bar(c, x, y - pad_v, tw + pad_h*2, 18, col=bg_col, r=9)
    txt(c, label, x + pad_h, y - pad_v + 5, size=10, color=fg, font='Helvetica-Bold')

# ── Chart helpers ─────────────────────────────────────────────────────────────
def make_revenue_chart():
    fig, ax = plt.subplots(figsize=(5.5, 2.8), facecolor='#0E211C')
    ax.set_facecolor('#15241F')
    years  = ['Year 1', 'Year 2', 'Year 3']
    users  = [200_000, 800_000, 2_000_000]
    paid   = [30_000,  144_000, 400_000]
    rev    = [u * 0.99 * 12 for u in paid]  # ARR
    x = np.arange(3)
    w = 0.38
    b1 = ax.bar(x - w/2, [u/1e6 for u in users], w, color='#253D35', label='Users (M)', zorder=3)
    b2 = ax.bar(x + w/2, [r/1e6 for r in rev],   w, color='#3FB985', label='ARR (€M)',  zorder=3)
    ax.set_xticks(x); ax.set_xticklabels(years, color='#8AA398', fontsize=10)
    ax.set_yticks([0, 0.5, 1, 1.5, 2]); ax.set_yticklabels(['0','0.5M','1M','1.5M','2M'], color='#8AA398', fontsize=9)
    ax.tick_params(colors='#8AA398', which='both', length=0)
    ax.spines[:].set_visible(False)
    ax.yaxis.grid(True, color='#1E3D35', linewidth=0.5, zorder=0)
    ax.set_axisbelow(True)
    legend = ax.legend(facecolor='#0E211C', edgecolor='#253D35', labelcolor='#EAF2ED', fontsize=9,
                       loc='upper left', framealpha=0.9)
    for spine in ax.spines.values(): spine.set_visible(False)
    for bar_, rev_ in zip(b2, rev):
        ax.text(bar_.get_x() + bar_.get_width()/2, bar_.get_height() + 0.02,
                f'€{rev_/1000:.0f}K', ha='center', va='bottom', color='#E8B24C', fontsize=8.5, fontweight='bold')
    fig.tight_layout(pad=0.4)
    buf = BytesIO(); fig.savefig(buf, format='png', dpi=160, facecolor='#0E211C')
    plt.close(fig); buf.seek(0)
    return buf

def make_funnel_chart():
    fig, ax = plt.subplots(figsize=(3.5, 2.5), facecolor='#0E211C')
    ax.set_facecolor('#0E211C')
    ax.set_xlim(0, 10); ax.set_ylim(-0.5, 3)
    colors = ['#253D35', '#1E3D35', '#3FB985']
    labels = ['200K  users', '30K  paid (15%)', '€356K  ARR year 1']
    widths = [9, 6, 3.8]
    for i, (w_, lab, col) in enumerate(zip(widths, labels, colors)):
        y = 2 - i * 0.9
        ax.barh(y, w_, left=(10 - w_)/2, height=0.6, color=col, zorder=3)
        ax.text(5, y, lab, ha='center', va='center', color='#EAF2ED', fontsize=9.5, fontweight='bold')
    ax.axis('off')
    fig.tight_layout(pad=0.2)
    buf = BytesIO(); fig.savefig(buf, format='png', dpi=160, facecolor='#0E211C')
    plt.close(fig); buf.seek(0)
    return buf

# ── Slides ────────────────────────────────────────────────────────────────────

def slide1_cover(c):
    """Cover: logo, title, tagline, app screenshot"""
    bg(c)
    # Left half: branding
    # Subtle gradient band
    c.setFillColor(SURFACE)
    c.rect(0, 0, W * 0.48, H, fill=1, stroke=0)
    # Decorative top bar
    bar(c, 0, H - 4, W * 0.48, 4, col=GREEN)

    # Logo mark
    logo_mark(c, 0.55*inch, H - 1.05*inch, r=28)

    # Title
    txt(c, 'MyFam', 0.35*inch, H - 2.05*inch, size=60, color=TEXT, font='Helvetica-Bold')

    # Tagline
    txt(c, 'discover how you\'re connected', 0.35*inch, H - 2.62*inch,
        size=17, color=GREEN, font='Helvetica')

    divider(c, 0.35*inch, H - 2.85*inch, 3.8*inch)

    # Three feature pills
    pills = ['🌳  Family tree builder', '🌐  World map', '✨  4D ring view']
    for i, p in enumerate(pills):
        bar(c, 0.35*inch, H - 3.42*inch - i*0.46*inch, 3.5*inch, 0.35*inch, col=UP, r=6)
        txt(c, p, 0.55*inch, H - 3.28*inch - i*0.46*inch, size=12.5, color=TEXT, font='Helvetica')

    # Bottom: connect feature
    bar(c, 0.35*inch, 0.8*inch, 3.7*inch, 0.42*inch, col=GREEN, r=8)
    txt(c, '📲  Tap phones to discover shared relatives', 0.55*inch, 0.96*inch,
        size=12, color=BG, font='Helvetica-Bold')

    # Right half: app screenshot
    img(c, os.path.join(DIR, 'frame_iphone.jpg'),
        W * 0.49, 0.25*inch, W * 0.50, H - 0.5*inch, radius=12)

    pgnum(c, 1)


def slide2_problem(c):
    """Problem slide"""
    bg(c)
    bar(c, 0, H - 4, 2.8*inch, 4, col=GOLD)
    txt(c, 'The Problem', 0.45*inch, H - 0.62*inch, size=13, color=GOLD, font='Helvetica-Bold')
    txt(c, 'Family connections', 0.45*inch, H - 1.25*inch, size=36, color=TEXT, font='Helvetica-Bold')
    txt(c, 'are getting lost.', 0.45*inch, H - 1.75*inch, size=36, color=TEXT, font='Helvetica-Bold')

    divider(c, 0.45*inch, H - 2.0*inch, 5.5*inch)

    probs = [
        ('70%',       'of people don\'t know relatives beyond 1st degree'),
        ('Ancestry',  'is complex, desktop-first & expensive'),
        ('No app',    'lets you discover distant connections in real-time'),
        ('1.3 billion', 'people rely on mobile as their primary device'),
    ]
    for i, (kw, desc) in enumerate(probs):
        y = H - 2.55*inch - i * 0.72*inch
        bar(c, 0.45*inch, y - 0.08*inch, 1.25*inch, 0.38*inch, col=UP, r=6)
        txt(c, kw, 0.58*inch, y + 0.08*inch, size=14, color=GOLD, font='Helvetica-Bold')
        txt(c, desc, 1.85*inch, y + 0.08*inch, size=13, color=TEXT, font='Helvetica')

    # Right: image
    img(c, os.path.join(DIR, 'frame_connect.jpg'),
        W * 0.53, 0.4*inch, W * 0.44, H - 0.8*inch, radius=12)

    pgnum(c, 2)


def slide3_product(c):
    """Product / solution slide with 3 app screenshots"""
    bg(c)
    bar(c, 0, H - 4, 3.2*inch, 4, col=GREEN)
    txt(c, 'The Solution', 0.45*inch, H - 0.62*inch, size=13, color=GREEN, font='Helvetica-Bold')
    txt(c, 'A beautiful, social', 0.45*inch, H - 1.22*inch, size=30, color=TEXT, font='Helvetica-Bold')
    txt(c, 'family tree — in your pocket.', 0.45*inch, H - 1.68*inch, size=30, color=TEXT, font='Helvetica-Bold')

    features = [
        ('2D Tree',    'Drag-and-drop builder with T-bar connectors'),
        ('4D Rings',   'Generational rings in 3D — see the depth'),
        ('World Map',  'Family members pinned to cities worldwide'),
        ('Connect',    'NFC tap — discover shared relatives instantly'),
    ]
    for i, (kw, desc) in enumerate(features):
        y = H - 2.35*inch - i * 0.62*inch
        bar(c, 0.45*inch, y + 0.02*inch, 0.08*inch, 0.32*inch, col=GREEN, r=2)
        txt(c, kw,  0.65*inch, y + 0.2*inch, size=13, color=GOLD,  font='Helvetica-Bold')
        txt(c, desc, 0.65*inch, y + 0.02*inch, size=11.5, color=SOFT, font='Helvetica')

    # Three stacked screenshots on the right
    sw = W * 0.185; sh = H * 0.7; gap = 0.18*inch
    rx = W - (sw * 3 + gap * 2) - 0.35*inch
    ry = (H - sh) / 2
    imgs = ['frame_iphone.jpg', 'frame_4d.jpg', 'frame_globe.jpg']
    for i, fn in enumerate(imgs):
        xi = rx + i * (sw + gap)
        img(c, os.path.join(DIR, fn), xi, ry, sw, sh, radius=10)

    pgnum(c, 3)


def slide4_model(c):
    """Business model slide"""
    bg(c)
    bar(c, 0, H - 4, 3.5*inch, 4, col=GOLD)
    txt(c, 'Business Model', 0.45*inch, H - 0.62*inch, size=13, color=GOLD, font='Helvetica-Bold')
    txt(c, 'Freemium — one simple unlock', 0.45*inch, H - 1.25*inch,
        size=28, color=TEXT, font='Helvetica-Bold')

    # Free tier box
    fx, fy, fw, fh = 0.45*inch, H - 4.0*inch, W * 0.40, 2.4*inch
    c.setFillColor(SURFACE); c.roundRect(fx, fy, fw, fh, 10, fill=1, stroke=0)
    c.setStrokeColor(BORDER); c.setLineWidth(0.8)
    c.roundRect(fx, fy, fw, fh, 10, fill=0, stroke=1)
    tag(c, 'FREE', fx + 0.2*inch, fy + fh - 0.35*inch, bg_col=BORDER, fg=TEXT)
    txt(c, 'Build your family tree', fx + 0.2*inch, fy + fh - 0.75*inch, size=14, color=TEXT, font='Helvetica-Bold')
    free_items = ['See up to 3rd-degree relatives', 'Add & connect family members',
                  'All 3 views (2D, 4D, Globe)', 'Share via QR / link']
    bullet(c, free_items, fx + 0.35*inch, fy + fh - 1.1*inch, size=12, gap=22, color=SOFT)

    # Arrow between
    ax = fx + fw + 0.22*inch
    ay = H - 2.7*inch
    txt(c, '→', ax, ay, size=22, color=GREEN, font='Helvetica-Bold')

    # Paid tier box
    px = ax + 0.52*inch; py = fy; pw = W * 0.44; ph = fh
    c.setFillColor(UP); c.roundRect(px, py, pw, ph, 10, fill=1, stroke=0)
    c.setStrokeColor(GREEN); c.setLineWidth(1.2)
    c.roundRect(px, py, pw, ph, 10, fill=0, stroke=1)
    tag(c, '€0.99 / month', px + 0.2*inch, py + ph - 0.35*inch, bg_col=GREEN, fg=BG)
    txt(c, 'Unlimited visibility', px + 0.2*inch, py + ph - 0.75*inch, size=14, color=TEXT, font='Helvetica-Bold')
    paid_items = ['See all distant relatives', 'Path of connection via shared ancestor',
                  'Priority in match suggestions', 'Family statistics & insights']
    bullet(c, paid_items, px + 0.35*inch, py + ph - 1.1*inch, size=12, gap=22, color=TEXT)

    # Revenue note
    txt(c, '15% conversion x 200K users = €356,400 ARR in year 1',
        0.45*inch, 0.4*inch, size=11.5, color=GOLD, font='Helvetica-Bold')

    pgnum(c, 4)


def slide5_market(c):
    """Market & projections"""
    bg(c)
    bar(c, 0, H - 4, 3.2*inch, 4, col=GREEN)
    txt(c, 'Market & Projections', 0.45*inch, H - 0.62*inch, size=13, color=GREEN, font='Helvetica-Bold')
    txt(c, '200,000 users', 0.45*inch, H - 1.22*inch, size=32, color=TEXT, font='Helvetica-Bold')
    txt(c, 'in the first year', 0.45*inch, H - 1.68*inch, size=32, color=GREEN, font='Helvetica-Bold')

    # KPIs
    kpis = [
        ('TAM',  '500M EU adults | 30M active genealogy enthusiasts'),
        ('MVP',  'Web SPA + Cloudflare Worker backend — live today'),
        ('CAC',  '< €2 via social sharing & viral NFC-connect feature'),
        ('LTV',  '€0.99 × 12 × avg. 2 yrs = €23.76 per paying user'),
    ]
    for i, (kw, desc) in enumerate(kpis):
        y = H - 2.42*inch - i * 0.55*inch
        bar(c, 0.45*inch, y, 0.7*inch, 0.3*inch, col=UP, r=5)
        txt(c, kw, 0.55*inch, y + 0.08*inch, size=11, color=GOLD, font='Helvetica-Bold')
        txt(c, desc, 1.28*inch, y + 0.08*inch, size=11.5, color=SOFT, font='Helvetica')

    # Revenue chart
    chart = make_revenue_chart()
    img(c, chart, W * 0.50, 0.45*inch, W * 0.48, H - 1.0*inch, radius=10)

    pgnum(c, 5)


def slide6_ask(c):
    """The ask / vision / contact"""
    bg(c)
    # Left panel
    c.setFillColor(SURFACE); c.rect(0, 0, W * 0.46, H, fill=1, stroke=0)
    bar(c, 0, H - 4, W * 0.46, 4, col=GOLD)

    txt(c, 'Seed Round', 0.45*inch, H - 0.62*inch, size=13, color=GOLD, font='Helvetica-Bold')
    txt(c, '€300,000', 0.45*inch, H - 1.35*inch, size=42, color=TEXT, font='Helvetica-Bold')

    divider(c, 0.45*inch, H - 1.6*inch, 4.8*inch)

    # Fund allocation
    allocs = [
        (40, '#3FB985', 'Engineering   — mobile apps & backend scaling'),
        (30, '#E8B24C', 'Marketing     — user acquisition & growth'),
        (20, '#4A6E60', 'Operations    — GDPR compliance & infrastructure'),
        (10, '#253D35', 'Legal & IP    — EU trademark registration'),
    ]
    ay = H - 2.1*inch
    for pct, col, label in allocs:
        c.setFillColor(HexColor(col))
        c.roundRect(0.45*inch, ay, pct / 100 * 4.6*inch, 0.28*inch, 4, fill=1, stroke=0)
        txt(c, f'{pct}%  {label}', 0.55*inch, ay + 0.06*inch, size=11.5,
            color=TEXT, font='Helvetica', align='left')
        ay -= 0.52*inch

    # Roadmap
    divider(c, 0.45*inch, H - 4.72*inch, 4.8*inch)
    txt(c, 'Roadmap', 0.45*inch, H - 5.0*inch, size=13, color=GOLD, font='Helvetica-Bold')
    roadmap = [
        'Q3 2026 — iOS & Android native apps',
        'Q4 2026 — 50K MAU, payment system live',
        'Q1 2027 — 200K MAU, expand to DACH market',
        'Q2 2027 — Series A',
    ]
    bullet(c, roadmap, 0.55*inch, H - 5.42*inch, size=12, gap=24, color=TEXT)

    # Right: vision + contact
    rx = W * 0.49
    txt(c, '"Everyone has a family."', rx, H - 1.0*inch,
        size=19, color=TEXT, font='Helvetica-Bold')
    txt(c, 'MyFam makes that connection visible —', rx, H - 1.5*inch,
        size=14, color=SOFT, font='Helvetica')
    txt(c, 'for everyone, everywhere in the world.', rx, H - 1.82*inch,
        size=14, color=SOFT, font='Helvetica')

    # Connect image
    img(c, os.path.join(DIR, 'frame_connect.jpg'),
        rx, 1.2*inch, W * 0.50 - 0.3*inch, H - 3.2*inch, radius=12)

    # Contact strip
    c.setFillColor(UP); c.roundRect(rx, 0.3*inch, W * 0.50 - 0.3*inch, 0.75*inch, 8, fill=1, stroke=0)
    txt(c, '🌐  myfam.app', rx + 0.2*inch, 0.62*inch, size=12.5, color=GREEN, font='Helvetica-Bold')
    txt(c, '📧  info@n-aurea.com', rx + 0.2*inch, 0.4*inch, size=12, color=SOFT, font='Helvetica')
    txt(c, 'Jason van Dijk', W - 0.35*inch, 0.62*inch, size=12, color=TEXT,
        font='Helvetica-Bold', align='right')
    txt(c, 'Founder & CEO', W - 0.35*inch, 0.4*inch, size=11, color=SOFT,
        font='Helvetica', align='right')

    pgnum(c, 6)


# ── Build PDF ─────────────────────────────────────────────────────────────────
c = canvas.Canvas(OUT, pagesize=(W, H))
c.setTitle("MyFam — Pitch Deck 2026")
c.setAuthor("Jason van Dijk")
c.setSubject("Seed Investment Pitch")

for fn in [slide1_cover, slide2_problem, slide3_product,
           slide4_model, slide5_market, slide6_ask]:
    fn(c)
    c.showPage()

c.save()
print(f"✓  Saved: {OUT}")
print(f"   {os.path.getsize(OUT) // 1024} KB")

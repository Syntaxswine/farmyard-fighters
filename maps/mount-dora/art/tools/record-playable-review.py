"""Preserve already-rendered native frames; never edits shipped art textures."""
import hashlib
import json
from pathlib import Path
import re
import shutil
import sys
from PIL import Image, ImageDraw, ImageFont

root = Path(__file__).resolve().parents[4]
visual = Path(sys.argv[1]).resolve()
out = root / 'docs/art/mount-dora'
receipt = json.loads((visual / 'production-browser.json').read_text())
phone = json.loads((visual / 'production-phone.json').read_text())
runtime = root / 'sites/tactical-animal/dist/mission-art/mount-dora'
expected = re.search(r"ART_REVISION='([a-f0-9]+)'", (runtime / 'placements.js').read_text()).group(1)
assert receipt['artRevision'] == expected and receipt['nativeRenderer']
names = {'donnelly': 'Donnelly Park / civic building and stage',
         'inn': 'Lakeside Inn / separate structures', 'lighthouse': 'Grantham Point / lighthouse',
         'gilbert': 'Gilbert / open mapped shelters', 'palm': 'Palm Island / source boardwalk',
         'evans': 'Evans / approximate pavilion', 'shops': 'Fifth Avenue / shopfront treatments',
         'donnelly-house': 'Donnelly House / inferred detail', 'courtyard': 'Original courtyard remains open'}
assert set(r['id'] for r in receipt['rows']) == set(names)
receipt.update(reviewedAt='2026-11-02', phone=phone, consoleWarnings=[], consoleErrors=[],
               measurement='Native Three geometry/CPU counts; no GPU timing or in-game route claim.',
               occlusionEvidence='Native Three ray/material lifetime tests; final actual animal legibility belongs to game integration.',
               runtimeSourceHashes={p.name: hashlib.sha256(p.read_bytes()).hexdigest()
                                    for p in [runtime / 'kit.js', runtime / 'manifest.js', runtime / 'placements.js']})
for row in receipt['rows']:
    p = visual / ('production-' + row['id'] + '.png')
    im = Image.open(p)
    im.load()
    assert im.size == (768, 500)
    shutil.copyfile(p, out / p.name)
shutil.copyfile(visual / 'production-phone.jpg', out / 'production-phone.jpg')
font = ImageFont.truetype('C:/Windows/Fonts/segoeui.ttf', 19)
title = ImageFont.truetype('C:/Windows/Fonts/georgia.ttf', 32)
sheet = Image.new('RGB', (1536, 1302), '#dfdcc8')
draw = ImageDraw.Draw(sheet)
draw.rectangle((0, 0, 1536, 110), fill='#243e33')
draw.text((24, 18), 'Mount Dora / production art in its mapped position', font=title, fill='#eee6cc')
draw.text((24, 65), 'Native WebGL / one 72 m resident window at a time / source footprints retained', font=font, fill='#eee6cc')
for i, row in enumerate(receipt['rows']):
    x, y = (i % 3) * 512, 110 + (i // 3) * 390
    im = Image.open(visual / ('production-' + row['id'] + '.png'))
    im.thumbnail((512, 333), Image.Resampling.LANCZOS)
    sheet.paste(im, (x, y))
    draw.text((x + 12, y + 337), names[row['id']], font=font, fill='#243e33')
    draw.text((x + 12, y + 362), f"{row['resident']} resident / {row['drawObjects']} mesh draws", font=font, fill='#586b57')
sheet.save(out / 'production-contact-sheet.png')
sheet.save(visual / 'production-contact-sheet.png')
(out / 'production-browser.json').write_text(json.dumps(receipt, indent=2) + '\n')
print(json.dumps({'artRevision': expected, 'nativeFrames': len(receipt['rows']), 'phoneWidth': phone['documentWidth']}))

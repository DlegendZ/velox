"""Build labelled contact sheets for visual QA; originals remain untouched."""
import sys, glob, math, json
from pathlib import Path
from PIL import Image, ImageDraw
files = sorted({p for pattern in sys.argv[2:] for p in glob.glob(pattern, recursive=True)})
prefix = Path(sys.argv[1]); prefix.parent.mkdir(parents=True, exist_ok=True)
pages = []
for start in range(0, len(files), 10):
    batch = files[start:start+10]
    sheet = Image.new('RGB', (1600, math.ceil(len(batch)/2)*470), '#151a22')
    draw = ImageDraw.Draw(sheet)
    for i, name in enumerate(batch):
        im = Image.open(name).convert('RGB'); im.thumbnail((790, 438))
        x=(i%2)*800; y=(i//2)*470
        sheet.paste(im, (x+(790-im.width)//2,y+25))
        draw.text((x+8,y+5),str(Path(name).parent.name)+' / '+Path(name).name,fill='#ffffff')
    out=f'{prefix}-{start//10+1}.jpg'; sheet.save(out,quality=93); pages.append(out)
Path(f'{prefix}.json').write_text(json.dumps({'sources':files,'sheets':pages},indent=2))
print(json.dumps(pages))

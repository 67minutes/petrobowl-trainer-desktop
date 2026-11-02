from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

out = Path(__file__).resolve().parent.parent / 'build'
out.mkdir(exist_ok=True)
image = Image.new('RGBA', (256, 256), (0, 0, 0, 0))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((8, 8, 248, 248), radius=46, fill='#087c82')
font = ImageFont.truetype(r'C:\Windows\Fonts\segoeuib.ttf', 110)
box = draw.textbbox((0, 0), 'PB', font=font)
draw.text((128-(box[2]-box[0])/2, 128-(box[3]-box[1])/2-box[1]), 'PB', font=font, fill='white')
draw.ellipse((193,193,239,239), fill='#c6dfd3', outline='white', width=8)
image.save(out/'icon.png')
image.save(out/'icon.ico', sizes=[(16,16),(24,24),(32,32),(48,48),(64,64),(128,128),(256,256)])

from pathlib import Path
from PIL import Image, ImageDraw
from reportlab.graphics.barcode import qrencoder

URL = "https://ict-midterm-artyom.vercel.app"
qr = qrencoder.QRCode(None, qrencoder.QRErrorCorrectLevel.Q)
qr.addData(URL)
qr.make()
modules = qr.getModuleCount()
quiet = 4
scale = 18
size = (modules + 2 * quiet) * scale
image = Image.new("RGB", (size, size), "white")
draw = ImageDraw.Draw(image)
for row in range(modules):
    for col in range(modules):
        if qr.isDark(row, col):
            x = (col + quiet) * scale
            y = (row + quiet) * scale
            draw.rectangle((x, y, x + scale - 1, y + scale - 1), fill="black")
destination = Path(__file__).parent / "assets" / "demo-qr.png"
destination.parent.mkdir(parents=True, exist_ok=True)
image.save(destination)
print(f"{destination}: {size}x{size}, {modules} core modules, {quiet}-module quiet zone, error correction Q, exact payload {URL}")

import json
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    import subprocess, sys
    subprocess.run([sys.executable, "-m", "pip", "install", "pillow", "--break-system-packages"])
    from PIL import Image, ImageDraw, ImageFont

img = Image.new("RGB", (1200, 630), color="#0a0a0f")
draw = ImageDraw.Draw(img)

# Background gradient effect (simple rectangles)
for i in range(0, 630, 2):
    alpha = int(20 * (1 - i/630))
    draw.rectangle([(0, i), (1200, i+2)], fill=(108, 92, 231, alpha))

# Accent bar at top
draw.rectangle([(0, 0), (1200, 6)], fill="#6c5ce7")

# Try to use a font, fall back to default
try:
    title_font = ImageFont.truetype("arial.ttf", 72)
    sub_font   = ImageFont.truetype("arial.ttf", 36)
    tag_font   = ImageFont.truetype("arial.ttf", 28)
except:
    title_font = ImageFont.load_default()
    sub_font   = title_font
    tag_font   = title_font

# Main title
draw.text((80, 120), "AI Compass", font=title_font, fill="#ffffff")

# Subtitle
draw.text((80, 230), "Find the perfect AI tool for your workflow", font=sub_font, fill="#a0a0c8")

# Description
draw.text((80, 310), "500+ curated AI tools · Smart search · Student-friendly", font=tag_font, fill="#8080aa")

# Stats row
stats = ["500+ Tools", "Free to use", "Smart Search", "Student Perks"]
x = 80
for stat in stats:
    draw.rounded_rectangle([(x, 420), (x+160, 470)], radius=8, fill="#1e1e2e")
    draw.text((x+14, 433), stat, font=tag_font, fill="#6c5ce7")
    x += 185

# URL at bottom
draw.text((80, 560), "ai-compass-1.onrender.com", font=tag_font, fill="#555570")

out = Path("frontend/public/og-image.png")
out.parent.mkdir(parents=True, exist_ok=True)
img.save(out, "PNG")
print(f"Saved OG image: {out} ({out.stat().st_size // 1024}KB)")

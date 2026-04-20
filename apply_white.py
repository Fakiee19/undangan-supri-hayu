import re

filepath = 'c:/Users/acer/Downloads/undangan-pernikahan-supri-hayu-main/style.css'

with open(filepath, 'r', encoding='utf-8') as f:
    text = f.read()

# Replace CSS variables
text = re.sub(r'--cream:\s*#1e1e24;', '--cream: #ffffff;', text)
text = re.sub(r'--cream-dark:\s*#121216;', '--cream-dark: #f0f0f0;', text)
text = re.sub(r'--white:\s*#ffffff;', '--white: #000000;', text)
text = re.sub(r'--ink:\s*#f5f5f5;', '--ink: #111111;', text)
text = re.sub(r'--ink-soft:\s*#a0a0aa;', '--ink-soft: #555555;', text)
text = re.sub(r'--glass:\s*rgba\(30, 30, 36, 0\.7\);', '--glass: rgba(240, 240, 240, 0.7);', text)

# Remove background image
text = re.sub(r'background:\s*url\([^)]+\)\s*center\s*/\s*cover\s*no-repeat;', 'background: none;', text)

# Change preloader background
text = re.sub(r'background:\s*radial-gradient\(ellipse at center,[^)]+\);', 'background: #ffffff;', text)

# Hide grain and orbs
text = re.sub(r'\.grain\s*\{', '.grain { display: none !important;', text)
text = re.sub(r'\.gradient-orb\s*\{', '.gradient-orb { display: none !important;', text)

# Fix some remaining rgba colors that were manually hardcoded
# .invite-card
text = re.sub(r'background:\s*rgba\(30,\s*31,\s*36,\s*0\.65\);', 'background: rgba(255, 255, 255, 0.65);', text)
# .verse-card
text = re.sub(r'background:\s*rgba\(30,\s*31,\s*36,\s*0\.75\);', 'background: rgba(255, 255, 255, 0.75);', text)
# .music-toggle
text = re.sub(r'background:\s*rgba\(30,\s*31,\s*36,\s*0\.92\);', 'background: rgba(255, 255, 255, 0.92);', text)
text = re.sub(r'background:\s*rgba\(30,\s*31,\s*36,\s*0\.06\);', 'background: rgba(0, 0, 0, 0.06);', text)

# hero text shadows might look bad on white background
text = re.sub(r'text-shadow:\s*0\s*8px\s*40px\s*rgba\(0,\s*0,\s*0,\s*0\.35\);', 'text-shadow: none;', text)

# couple parallax bg
text = re.sub(r'\.couple-parallax__bg\s*\{[^}]+\}', '.couple-parallax__bg { background: none; }', text)
text = re.sub(r'body\.low-fx \.couple-parallax__bg\s*\{[^}]+\}', 'body.low-fx .couple-parallax__bg { background: none; }', text)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(text)

print("CSS variables and backgrounds updated!")

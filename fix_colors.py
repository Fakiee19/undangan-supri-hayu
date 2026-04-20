import sys

filepath = 'c:/Users/acer/Downloads/undangan-pernikahan-supri-hayu-main/style.css'

with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
    text = f.read()

# Replace light overlays with dark overlays
text = text.replace('rgba(255, 252, 247,', 'rgba(30, 31, 36,')
text = text.replace('rgba(247, 242, 233,', 'rgba(25, 26, 30,')
text = text.replace('rgba(235, 227, 212,', 'rgba(20, 21, 24,')

text = text.replace('rgba(255,252,247,', 'rgba(30,31,36,')
text = text.replace('rgba(247,242,233,', 'rgba(25,26,30,')
text = text.replace('rgba(235,227,212,', 'rgba(20,21,24,')

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(text)

print("Replacement successful")

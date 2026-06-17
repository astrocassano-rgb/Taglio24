from PIL import Image

img = Image.open('logo.png')

# image size is 1024x1024
# crop top center square for the dog face
left = 250
top = 180
right = 750
bottom = 680
img_cropped = img.crop((left, top, right, bottom))
img_cropped.save('favicon-cropped.png')
print('success')

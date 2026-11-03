# The site's link thumbnail

`src/app/opengraph-image.jpg` and `src/app/twitter-image.jpg` (the same file) are drawn from `og.html`
here: a manga panel with speed lines, the site icon and the three games' colours. No Bandai logos,
card art or characters.

To redraw it (e.g. when the store count changes; set it in `og.html`):

```
cd docs/share-image && node shot.js            # writes og.png (1200×630)
python3 -c "from PIL import Image;Image.open('og.png').convert('RGB').save('og.jpg',quality=90,optimize=True)"
cp og.jpg ../../src/app/opengraph-image.jpg && cp og.jpg ../../src/app/twitter-image.jpg
```

Keep the wordmark inside the centre square (x 285–915) and nothing essential below y ≈ 575,
where Reddit and X draw the domain. Look at the PNG before committing.

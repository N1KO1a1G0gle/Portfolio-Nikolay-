# Nikolay Stoyanov — Portfolio

Static site, no build step. Open `index.html` in a browser, or drop the whole folder onto any static host (GitHub Pages, Netlify, Cloudflare Pages).

## Pages

- `index.html` — Home (hero, selected work, gallery teaser, journal, about, contact)
- `project.html` — Project case study template
- `post.html` — Blog post template
- `gallery.html` — Full photo gallery
- `css/style.css` — All styles (design tokens are CSS variables at the top)

## Swapping in real photos

Every diagonal-hatch placeholder is a `<div class="ph">` (or `<a class="ph">`). Replace it with an image, keeping any sizing class:

```html
<!-- before -->
<div class="ph full-bleed hero-photo">full-bleed hero photograph</div>

<!-- after -->
<img class="full-bleed hero-photo" src="images/hero.jpg" alt="..." style="object-fit:cover">
```

Put photos in an `images/` folder. `object-fit: cover` keeps them cropped to the layout instead of stretched.

## Adding a project or post

Copy `project.html` / `post.html`, rename it (e.g. `project-coop.html`), edit the text, and add a link to it from the Work / Journal sections in `index.html`.

## Colors & fonts

Defined as variables at the top of `css/style.css` — cream `#F7F4EE`, ink `#1F1B16`, clay accent `#CC785C`. Fonts (Fraunces, Cormorant Garamond, Inter) load from Google Fonts.

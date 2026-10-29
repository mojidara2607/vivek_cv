# Mojidara Vivek — CV website + PDF résumé

A static, white-theme portfolio CV with a Three.js 3D hero, plus an ATS-friendly PDF résumé generated from the same content.

```
index.html                                   3D CV website — open it directly or host it
assets/css/style.css                         styles (self-hosted fonts, no external requests)
assets/js/main.js                            smooth scroll, reveals, counters, 3D card tilt
assets/js/scene.bundle.js                    built 3D hero (three.js r169 bundled in) — don't edit
src/scene.js                                 source of the Three.js voxel "MV" hero
assets/vendor/lenis.min.js                   smooth-scroll library (vendored, pinned)
cv/index.html                                printable / ATS résumé source
Mojidara_Vivek_Full_Stack_Developer_CV.pdf   generated PDF (attach this to applications)
scripts/serve.mjs                            local preview server
scripts/build-pdf.mjs                        HTML → PDF with local Edge/Chrome
```

## Preview locally

Double-click `index.html` — it works straight from disk (plain scripts, no ES modules).
Or serve it: `npm run serve` → http://localhost:5173, or via WAMP at `http://localhost/Freelance/vivek/vivek_cv/`.

## Edit the 3D hero

```bash
npm install            # once
npm run build          # after editing src/scene.js → regenerates assets/js/scene.bundle.js
```

## Rebuild the PDF after editing `cv/index.html`

```bash
npm install            # once — installs puppeteer-core (uses your installed Edge/Chrome)
npm run pdf
npm run pdf -- --portfolio=https://your-site.example   # also prints the website link in the contact line
```

ATS rules the PDF follows: one column, real selectable text (no images of text), standard headings
(Professional Summary, Technical Skills, Professional Experience, Projects, Education), contact details in the
body, plain ASCII punctuation, ligatures disabled, tagged PDF. Check it any time with
`pdftotext Mojidara_Vivek_Full_Stack_Developer_CV.pdf -`.

## Deploy

Any static host works with the repo root as the site root — GitHub Pages (Settings → Pages → deploy from `main` / root),
Netlify or Vercel (no build command, publish directory `.`). After it's live, rebuild the PDF with `--portfolio=<url>`
so the résumé links back to the site.

## Performance notes

- Text paints first; the 3D bundle (~124 KB gzipped) loads after the page's load event and the canvas fades in.
- If scripts can't run, a 2.5 s safety net in `<head>` reveals all content.
- The hero is 2 instanced meshes + a contact-shadow quad; rendering pauses when the hero is off-screen or the tab is hidden.
- Pixel ratio is capped (1.75, or 1.35 on touch/low-core devices); `prefers-reduced-motion` gets a static scene and no smooth scrolling.

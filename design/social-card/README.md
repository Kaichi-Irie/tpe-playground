# Social card

`social-card-2d.png` and `social-card-3d.png` (1200×630) are rendered from `card.html?v=2d` and `card.html?v=3d`.

- `play2d-chart.svg`: the Play 2D chart SVG captured from the running app (trial 11, inline computed styles).
- `chart-clean.svg`: the same chart with labels removed, cropped to the plot, and strokes thickened.
- `play3d-surface.png`: the Play 3D WebGL canvas captured at 2× (trial 11).
- `tippy-pointing.png`: copy of `../fuwatane/fuwatane-lab-pointing.png`.

Render (replace `3d` with `2d` for the other variant):

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --hide-scrollbars \
  --allow-file-access-from-files --force-device-scale-factor=1 --window-size=1200,630 \
  --virtual-time-budget=2000 --screenshot="$PWD/social-card-3d.png" "file://$PWD/card.html?v=3d"
```

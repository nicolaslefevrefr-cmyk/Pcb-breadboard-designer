# PCB & Breadboard Designer

A tool for drawing wiring diagrams on a breadboard / perfboard (stripboard):
define the hole grid and its per-face electrical linking, optional power
rails, a library of components (configurable footprints with a number and
a name per pin), place jumpers/cables with bends and colors, and use a
debug probe to trace a net, list individual connections, and detect
overlaps.

## Features

- Configurable breadboard: hole count, spacing (default 2.54 mm), a center
  gap (like solderable/perma-proto boards), and independent column/row
  linking per face (front/back) since both faces share the same physical
  holes but can carry different copper-strip links.
- Optional power rails: two lines top and bottom (upper = +V/red, lower =
  GND/black), each forming one continuous net along the full board width.
- Component library: standard parts plus a custom-footprint editor (pin
  count per side, grid-based pin spacing, per-pin number and name), with a
  live SVG preview.
- Jumpers/cables: link any hole or pin to any other, chosen per face,
  draggable, with randomized colors. Bends (beta) are purely visual waypoints: only a wire's two ends are electrical. Wires stay attached
  to a component's pins and follow it when it is moved.
- Custom components have an independent body rectangle: in the editor, drag it to move it or drag a blue corner to resize it (saved in the JSON project/library).
- Tap a placed component to select it: a floating bar offers rotate, mirror, switch side, lock and delete. Components and wires can be locked individually; wires take priority when selecting overlapping items. Moving a component drags the ends of its connected wires with it.
- Debug probe: follows the copper face where the parts at the probed hole are soldered (opposite to their placement side), regardless of the viewed side.
- Debug mode: highlight a net, list every individual connection (e.g.
  "esp32 / gpio3 -> dfplayer / gpio2"), and flag overlapping points.
- Full project save/export/import as JSON, including custom footprints.
- "Reset" clears the board, placed components and wires, but keeps your
  component library.
- Installable PWA, works offline once loaded.

## Deploy to GitHub Pages

1. Push the **contents of this folder** (not the folder itself) to the
   root of a GitHub repository.
2. In the repository settings → **Pages**, pick the branch (e.g. `main`)
   and the `/ (root)` folder, then save.
3. The app will be served over HTTPS at the URL GitHub Pages gives you:
   HTTPS is required for the service worker to work and for the app to be
   installable (an install icon will appear in supporting browsers).

For a quick local test without deploying anything, open the separately
provided `app-standalone.html` file instead (no server required).

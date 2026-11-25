# EnclosureIQ

A subwoofer enclosure designer for cars and trucks that works on desktop and phones. Pick a vehicle, a sub and an amp; choose a box type; see how it will perform in the vehicle; then download build plans.

## Features

- **Box types:** sealed, ported (slot, round or flared ports), 4th-order bandpass, 6th-order parallel and series, quasi 6th order, 8th-order series, and free air / infinite baffle (trunk as the box). Rectangle or angled (sloped back or sloped baffle). Firing direction, blow-through / trunk-wall builds, isobaric loading, multiple subs, multi-layer baffles, bracing allowance.
- **Acoustic simulation:** Thiele/Small lumped-parameter model solved as an acoustic nodal network, so every enclosure type uses the same solver. Graphs:
  - SPL in the vehicle (with cabin gain) and outdoors
  - Maximum SPL (limited by rated power or Xmax)
  - Cone excursion against Xmax
  - Port air speed
  - Impedance and phase
  - Excursion-limited power
  - Group delay
  - Vehicle cabin transfer function
- **Bandpass auto-tune:** a coordinate-descent optimizer sets chamber volumes and port tunings for the flattest, loudest output across a target band, keeping ports short enough to fit the box.
- **360° view:** drag-to-orbit SVG renderer with auto-spin, X-ray (ports, walls, dividers) and finishes.
- **Build plans:** dimensioned front, side and top drawings; a cut list with bevel angles; panel drawings with cutout positions; 4×8 sheet nesting; port table; wiring and amp setup; materials list; step-by-step instructions. Downloads: PDF build sheet (jsPDF), CSV cut list, JSON design file.
- **Whole system:** every series/parallel wiring option for the chosen subs, amp power at each load (interpolated in 1/Z), load-stability check, current draw, power-wire gauge (0.5 V drop rule) and fuse size.
- **Libraries:** subwoofers, amplifiers and vehicles. Built-in entries come from manufacturer manuals and spec sheets (sources listed in each entry). Users can add, edit and reset entries. Published T/S values are cross-checked against each other and conflicts are flagged.
- **AI (when opened on claude.ai):** spec lookup, reading specs from an uploaded manual (PDF text or photos), vehicle space estimates, and a design assistant that reads and changes the design through page tools.
- **Guides & FAQ:** 17 detailed how-to guides (tools, steps, tips, common mistakes) with photos and diagrams, plus 19 FAQ answers.

## Run it locally

No build step. Requires Python 3.

```bash
./scripts/dev.sh
```

Then open http://localhost:8765/dev.html. Outside claude.ai the libraries and saved designs are stored in the browser (localStorage) and the AI features are hidden.

## Project layout

| Path | What it does |
| --- | --- |
| `index.html` | Page markup and all CSS (light and dark themes). Written for the claude.ai artifact host, which adds the `<html>`/`<head>` skeleton. |
| `js/physics.js` | T/S parameter derivation and consistency checks, alignments, port math, filters, cabin gain, network solver, result analysis. |
| `js/geometry.js` | Box sizing (rect and wedge profiles), port layout, bandpass chambers, cut list, sheet nesting, vehicle fit check, wiring options. |
| `js/model.js` | Design pipeline (design → driver → box → network → simulation → system checks), factory presets, bandpass optimizer. |
| `js/system.js` | Amp power at a load, current draw, wire gauge, fuse. |
| `js/app.js` | App shell, routing, Design workspace, results and graphs, saved designs. |
| `js/library.js` | Subwoofer, amplifier and vehicle libraries: lists, details, editors, AI lookup and manual import. |
| `js/plans.js`, `js/export.js` | Build plans page; PDF, CSV and JSON exports. |
| `js/draw.js`, `js/charts.js` | 360° orbit view, blueprint drawings, sheet layouts, icons; frequency charts. |
| `js/assistant.js`, `js/ai.js` | AI design assistant (with page tools), lookups and PDF text extraction. |
| `js/store.js` | Storage: shared `db` collections on claude.ai, localStorage elsewhere. |
| `js/guides.js` | How-to guides and FAQ content. |
| `data/*.json` | Built-in subwoofer, amplifier and vehicle data. |

## Accuracy notes

- The model was checked against JL Audio's published 12W3v3-4 data: sealed Qtc 0.834 vs 0.83, Fc 50.2 Hz vs 50.2 Hz, F3 43.7 Hz vs 43.7 Hz; ported box width 28.96" vs 29"; port length 25.8" vs 26.1".
- Vehicle entries are typical sizes per vehicle type, not measurements of specific models. Measure your vehicle.
- Simulations are small-signal estimates. Real results depend on build quality, driver tolerances, power compression and the cabin.

## Photo credits

Guide photos come from Wikimedia Commons, resized only:

- `img/infinite-baffle-18in.jpg`: [Large infinite baffle subwoofer with 18 inch woofer driver](https://commons.wikimedia.org/wiki/File:Large_infinite_baffle_subwoofer_with_18_inch_woofer_driver.JPG) by Daniel Christensen, [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/)
- `img/homemade-15in-box.jpg`: [Loudspeaker enclosure](https://commons.wikimedia.org/wiki/File:Loudspeaker_enclosure.jpg) by Daniel Christensen, [CC0](https://creativecommons.org/publicdomain/zero/1.0/)
- `img/internal-bracing.jpg`: [Subwoofer cab internal bracing](https://commons.wikimedia.org/wiki/File:Subwoofer_cab_internal_bracing.jpg) by B137, [CC0](https://creativecommons.org/publicdomain/zero/1.0/)
- `img/sub-and-enclosure.jpg`: [Subwoofer driver and enclosure](https://commons.wikimedia.org/wiki/File:Subwoofer_driver_and_enclosure.jpg) by B137, [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/)

Diagrams in `js/illustrations.js` are original to this project.

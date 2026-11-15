# The Fridge

A fridge you open in the browser. The door holds magnets for this week's plan, the weekly shopping streak, this week's grocery spend against the average, and a recipe not made in a while. Inside are the fridge, freezer, pantry and counter, with dashed "ghost" items for things that are usually there but aren't now. Below: weekly spend and what actually got cooked.

## How it works

`fridge.py` reads three tabs of the Meal Prep Data Google Sheet with a read-only service account, works out the page, and writes one static `index.html`. A systemd timer runs it every 15 minutes. The web server already on the box serves the file behind a password.

- **Purchases** (receipts): spend, streak, and what came in.
- **Meal Log**: this week's plan, what got cooked, the recipe rewind.
- **Inventory**: observations that override the receipt estimate.

Store numbers and addresses are never written to the page, only the chain name. Receipt and fridge photos are never published.

## Inventory tab

One row per observation, newest wins. Anything without a recent row is estimated from receipts and a shelf life per item.

| date | item | location | status | source | notes |
|---|---|---|---|---|---|
| 2026-11-22 | Eggs | fridge | low | photo | |
| 2026-11-22 | Almond milk | fridge | out | colin | |

- location: fridge, freezer, pantry (counter items like onions and bananas sort themselves)
- status: in, low, out
- source: photo, colin, estimate

A receipt dated after an observation brings the item back to "in".

## Run it

```
python3 fridge.py                    # from the Sheet, using fridge.env
python3 fridge.py --sample sample/   # from local CSVs: purchases.csv, meal_log.csv, inventory.csv
```

Needs Python 3.11+ and, for the Sheet, `python3-google-auth` and `python3-requests` (Debian packages).

To change what counts as one item (for example, so "Signature Chicken Thighs" and "Chicken Thigh" match), edit the `ITEMS` table in `fridge.py`.

## GitHub Pages

`.github/workflows/pages.yml` builds the page hourly (and on every push to main) and deploys it to GitHub Pages. It needs two repository secrets: `GCP_SA_KEY` (the full service-account JSON) and `SHEET_ID`. Each run checks the output with `.github/guard.sh`, which fails the build on a store number or street address, and commits `data/snapshot.json` (the page's data, no store names or notes) only when it changed, so the hourly schedule never goes dormant.

## 3D fridge, pantry and counter

The page draws your fridge, pantry and counter as a low-poly 3D scene with three.js. If a browser can't do WebGL, or something fails to load, it keeps the plain tile view. Add `?flat` to the address to force the tiles.

- `site/` is copied next to `index.html` on every build.
- `site/js/kitchen3d.js` builds the scenes, places items on shelves, prints labels and shows the tap tags.
- `site/models/map.json` says which model each grocery item uses, at real size in inches. Lookup order: the exact item name, then the first matching rule, then the item's category, then where it's stored. Anything new falls back to a sensible model, never a blank. You can change an item's `tint`, `label`, `count`, `spot` (crisper, shelf or door) or size in this file without touching code.
- Models starting with `#` (`#box`, `#tub`, `#eggs`, `#butter`) are built in code in the same flat-shaded style.

### Adding a model

1. Get a GLB file, either from another CC0 kit (Kenney, Quaternius, Poly Pizza CC0 entries) or exported from Blender (File > Export > glTF 2.0, format "glTF Binary"). Keep it low-poly and flat-shaded so it matches.
2. Put it under `site/models/<kit>/` with that kit's license file next to it.
3. Add a short name for it under `models` in `map.json`, then point an item or a rule at that name.

## Credits

- Food models: [Food Kit](https://kenney.nl/assets/food-kit) by Kenney, CC0. See `site/models/kenney-food/LICENSE.txt`.
- [three.js](https://threejs.org) r169, MIT. See `site/vendor/THREE-LICENSE.txt`.

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

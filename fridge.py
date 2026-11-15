#!/usr/bin/env python3
"""Build the fridge page from the Meal Prep Data sheet.

  python3 fridge.py                 # read the Google Sheet, write $OUT_DIR/index.html
  python3 fridge.py --sample DIR    # read CSVs from DIR instead (purchases, meal_log, inventory)
  python3 fridge.py --fragment      # write the page without <html>/<head> wrapping (for previews)

  python3 fridge.py --snapshot data/snapshot.json   # also write the sanitized data model

Config comes from the environment, then fridge.env next to this file, then the defaults below:
  SHEET_ID, GOOGLE_CREDENTIALS (service-account JSON key path), OUT_DIR
"""
import argparse, csv, datetime as dt, json, os, re, shutil, sys
from collections import defaultdict
from pathlib import Path
from zoneinfo import ZoneInfo

HERE = Path(__file__).resolve().parent
TZ = ZoneInfo("America/New_York")
RANGES = {"purchases": "Purchases!A:K", "meal_log": "'Meal Log'!A:G", "inventory": "Inventory!A:F"}
SKIP_TYPES = {"household", "floral", "fee_tax"}
DEFAULTS = {
    "SHEET_ID": "1NjsdyNfR9uFRwIDuz7BoBgvIMszcWcgeDAT2xcWHW-c",
    "GOOGLE_CREDENTIALS": str(Path.home() / ".config/fridge/service-account.json"),
    "OUT_DIR": "/var/www/fridge",
}

def conf(key):  # environment (incl. fridge.env) wins; empty counts as unset
    return os.environ.get(key) or DEFAULTS[key]

# --- loading -----------------------------------------------------------------

def load_env():
    f = HERE / "fridge.env"
    if f.exists():
        for line in f.read_text().splitlines():
            if "=" in line and not line.lstrip().startswith("#"):
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip())

def rows_to_dicts(rows):
    if not rows:
        return []
    head = [h.strip() for h in rows[0]]
    return [dict(zip(head, r + [""] * (len(head) - len(r)))) for r in rows[1:] if any(c.strip() for c in r)]

def fetch_sheet():
    from google.oauth2 import service_account
    from google.auth.transport.requests import AuthorizedSession
    creds = service_account.Credentials.from_service_account_file(
        conf("GOOGLE_CREDENTIALS"),
        scopes=["https://www.googleapis.com/auth/spreadsheets.readonly"])
    url = f"https://sheets.googleapis.com/v4/spreadsheets/{conf('SHEET_ID')}/values:batchGet"
    r = AuthorizedSession(creds).get(url, params=[("ranges", v) for v in RANGES.values()], timeout=30)
    r.raise_for_status()
    vals = r.json()["valueRanges"]
    return {k: rows_to_dicts(v.get("values", [])) for k, v in zip(RANGES, vals)}

def load_sample(d):
    out = {}
    for k in RANGES:
        p = Path(d) / f"{k}.csv"
        out[k] = rows_to_dicts(list(csv.reader(p.open()))) if p.exists() else []
    return out

# --- helpers -----------------------------------------------------------------

def day(s):
    try:
        return dt.date.fromisoformat(s.strip()[:10])
    except ValueError:
        return None

def money(s):
    try:
        return float(str(s).replace("$", "").replace(",", ""))
    except ValueError:
        return 0.0

def week_of(d):  # weeks start on Sunday, like his shopping
    return d - dt.timedelta(days=(d.weekday() + 1) % 7)

def store_name(s):  # "Safeway 123" -> "Safeway"; never publish store numbers or locations
    for chain in ("Safeway", "Trader Joe's", "Wegmans", "Harris Teeter", "Whole Foods", "Giant", "Aldi", "Costco", "Target"):
        if s.lower().startswith(chain.lower()):
            return chain
    return re.sub(r"[\s#]*\d+.*$", "", s).split(" ")[0] or "Store"

# Canonical names, so "Signature Chicken Thighs" and "Chicken Thigh" are one item.
# First match wins. (pattern, name, location, shelf-life days)
ITEMS = [
    (r"tortilla chips|tostitos", "Tortilla chips", "pantry", 30),
    (r"tortilla", "Flour tortillas", "pantry", 21),
    (r"almond milk vanilla|vanilla almond", "Vanilla almond milk", "fridge", 10),
    (r"almond milk", "Almond milk", "fridge", 10),
    (r"creamer|table cream", "Creamer", "fridge", 14),
    (r"heavy (whipping )?cream", "Heavy cream", "fridge", 14),
    (r"sour cream", "Sour cream", "fridge", 21),
    (r"cheddar|colby|4 cheese|provolone", "Cheese", "fridge", 30),
    (r"feta", "Feta", "fridge", 21),
    (r"mozzarella", "Mozzarella", "fridge", 10),
    (r"yogurt", "Yogurt", "fridge", 14),
    (r"egg", "Eggs", "fridge", 28),
    (r"(?<!peanut )butter(?!.*maple)", "Butter", "fridge", 60),
    (r"hummus", "Hummus", "fridge", 10),
    (r"chicken thigh", "Chicken thighs", "fridge", 5),
    (r"chicken breast|^chicken$", "Chicken breast", "fridge", 5),
    (r"ground turkey|perdue ground", "Ground turkey", "fridge", 5),
    (r"turkey sausage", "Turkey sausage", "fridge", 10),
    (r"sausage", "Sausage", "fridge", 7),
    (r"salmon", "Salmon", "fridge", 3),
    (r"bacon", "Bacon", "fridge", 10),
    (r"pizza", "Frozen pizza", "freezer", 120),
    (r"nugget", "Chicken nuggets", "freezer", 90),
    (r"frozen broccoli", "Frozen broccoli", "freezer", 120),
    (r"broccoli", "Broccoli", "fridge", 7),
    (r"brussels", "Brussels sprouts", "fridge", 7),
    (r"carrot", "Carrots", "fridge", 21),
    (r"bell pepper", "Bell peppers", "fridge", 10),
    (r"spinach", "Spinach", "fridge", 6),
    (r"(lemon|lime) juice", "Citrus juice", "fridge", 180),
    (r"lemon", "Lemons", "fridge", 21),
    (r"lime", "Limes", "fridge", 21),
    (r"green onion", "Green onions", "fridge", 7),
    (r"cilantro|parsley|dill|herbs", "Fresh herbs", "fridge", 7),
    (r"red onion", "Red onion", "counter", 30),
    (r"onion", "Onions", "counter", 30),
    (r"garlic", "Garlic", "counter", 30),
    (r"banana", "Bananas", "counter", 5),
    (r"apple(?! cider)", "Apples", "counter", 14),
    (r"sweet potato", "Sweet potatoes", "counter", 21),
    (r"crisscut", "Frozen fries", "freezer", 120),
    (r"potato", "Potatoes", "counter", 21),
    (r"diet coke", "Diet Coke", "pantry", 30),
    (r"naan", "Naan", "pantry", 10),
    (r"salsa verde", "Salsa verde", "pantry", 120),
    (r"olive oil", "Olive oil", "pantry", 180),
    (r"olive", "Olives", "pantry", 180),
    (r"pasta|fusilli|farfalle|rigatoni|spirals|orzo|pastina", "Pasta", "pantry", 365),
    (r"couscous", "Couscous", "pantry", 365),
    (r"rice", "Rice", "pantry", 365),
    (r"gnocchi", "Gnocchi", "pantry", 90),
    (r"triscuit", "Triscuits", "pantry", 60),
    (r"clif|kind clusters", "Snack bars", "pantry", 90),
    (r"cereal|cinnamon toast|life cereal|oatmeal|granola", "Cereal", "pantry", 60),
    (r"bread|sourdough|rye|buns|fougasse", "Bread", "pantry", 7),
    (r"peanut butter", "Peanut butter", "pantry", 120),
    (r"soy sauce", "Soy sauce", "pantry", 365),
    (r"bbq", "BBQ sauce", "pantry", 180),
    (r"beans", "Canned beans", "pantry", 365),
    (r"crushed tomato", "Crushed tomatoes", "pantry", 365),
    (r"prosecco", "Prosecco", "fridge", 60),
    (r"\bna beer|non-?alcoholic", "NA beer", "fridge", 60),
    (r"pretzel|popcorn|popcorners|chips", "Chips and pretzels", "pantry", 30),
]
LOC_BY_CAT = {"produce": "fridge", "protein": "fridge", "dairy": "fridge", "deli": "fridge",
              "dairy/frozen": "freezer", "alcohol": "fridge", "pantry": "pantry",
              "bakery": "pantry", "beverage": "pantry"}
LIFE_BY_CAT = {"produce": 7, "protein": 5, "dairy": 21, "deli": 14, "dairy/frozen": 90,
               "alcohol": 30, "pantry": 30, "bakery": 7, "beverage": 30}
IGNORE = r"unclear|coffee small|bag charge"
BRANDS = r"^(signature( select| farms)?|lucerne|o organics|premio|nellie's|digiorno|near east|sweet baby ray's|kind|reynolds|ziploc)\s+"

def canon(item, category):
    low = item.lower()
    for pat, name, loc, life in ITEMS:
        if re.search(pat, low):
            return name, loc, life
    if category.lower() == "alcohol":
        return "Beer", "fridge", 30
    loc = LOC_BY_CAT.get(category.lower(), "pantry")
    name = re.sub(BRANDS, "", item, flags=re.I).strip()
    return name[:1].upper() + name[1:].lower(), loc, LIFE_BY_CAT.get(category.lower(), 14)

def place(where, default):
    """'fridge: left door, top bin' -> ('fridge', 'door-left-1'). A bare 'fridge' has no spot."""
    loc, _, w = (where or default).partition(":")
    loc, w = loc.strip().lower() or default, w.lower()
    lvl = 1 if "top" in w else 3 if "bottom" in w else 2 if "middle" in w else None
    side = "right" if "right" in w else "left"
    spot = None
    if loc == "fridge":
        if "door" in w: spot = f"door-{side}-{lvl or 2}"
        elif "crisper" in w: spot = f"crisper-{side}"
        elif "drawer" in w: spot = "drawer"
        elif "shelf" in w: spot = f"shelf-{lvl or 2}"
    elif loc == "pantry" and w.strip():
        n = re.search(r"\d", w)
        spot = f"shelf-{n.group() if n else 1 if lvl == 1 else 5 if lvl == 3 else 3}"
    return loc, spot

# --- the model ---------------------------------------------------------------

def build(data, today):
    purchases = [p for p in data["purchases"] if day(p.get("date", ""))]
    for p in purchases:
        p["_d"] = day(p["date"])
    this_wk = week_of(today)

    # Spend by week. Groceries = everything but household, flowers, fees and tax.
    weeks = defaultdict(lambda: {"groceries": 0.0, "flowers": 0.0, "trips": set()})
    for p in purchases:
        w = weeks[week_of(p["_d"])]
        w["trips"].add((p["_d"], store_name(p.get("store", ""))))
        t = p.get("type", "").lower()
        if t == "floral":
            w["flowers"] += money(p.get("paid"))
        elif t not in SKIP_TYPES:
            w["groceries"] += money(p.get("paid"))
    first = min(weeks) if weeks else this_wk
    series, w = [], first
    while w <= this_wk:
        v = weeks.get(w)
        series.append({"week": w.isoformat(), "groceries": round(v["groceries"], 2) if v else 0,
                       "flowers": round(v["flowers"], 2) if v else 0, "shopped": bool(v)})
        w += dt.timedelta(days=7)
    past = [s["groceries"] for s in series[:-1] if s["shopped"]]
    avg = round(sum(past) / len(past), 2) if past else 0

    # Shopping streak: one trip per week is the quota.
    shopped = [s["shopped"] for s in series]
    cur = 0
    i = len(shopped) - 1 if shopped and shopped[-1] else len(shopped) - 2
    while i >= 0 and shopped[i]:
        cur, i = cur + 1, i - 1
    best = run = 0
    for s in shopped:
        run = run + 1 if s else 0
        best = max(best, run)

    # This week's plan: the newest week in the Meal Log.
    log = [m for m in data["meal_log"] if day(m.get("week_of", ""))]
    plan = []
    if log:
        newest = max(day(m["week_of"]) for m in log)
        plan = [{"slot": m.get("slot", ""), "meal": m.get("meal", ""), "status": m.get("status", "")}
                for m in log if day(m["week_of"]) == newest]
        plan.sort(key=lambda m: m["slot"] != "batch main")

    # Recently eaten, and a rewind card: a shared meal not seen in a while.
    eaten = []
    for m in log:
        if m.get("status", "").startswith("cooked"):
            eaten.append({"date": (day(m.get("date", "")) or day(m["week_of"])).isoformat(), "meal": m["meal"]})
    eaten.sort(key=lambda m: m["date"], reverse=True)
    last_seen = {}
    for m in log:
        if not re.match(r"(cooked|planned)", m.get("status", "")):
            continue
        if re.search(r"pork|colin only|steak|beef|carbonara", (m.get("notes", "") + m["meal"]).lower()):
            continue
        d = day(m.get("date", "")) or day(m["week_of"])
        for meal in m["meal"].split(";"):
            meal = meal.strip()
            key = meal.lower().split(" with ")[0]
            if meal and (key not in last_seen or d > last_seen[key][0]):
                last_seen[key] = (d, meal)
    old = sorted((v for v in last_seen.values() if (today - v[0]).days >= 28), key=lambda v: v[0])[:6]
    rewind = None
    if old:
        d, meal = old[today.isocalendar()[1] % len(old)]
        rewind = {"meal": meal[:1].upper() + meal[1:], "last": d.isoformat(), "weeks_ago": (today - d).days // 7}

    # Inventory: receipts give an estimate, Inventory rows (photo or Colin) override.
    items = {}
    for p in purchases:
        if p.get("type", "").lower() in SKIP_TYPES or re.search(IGNORE, p.get("item", "").lower()):
            continue
        name, loc, life = canon(p.get("item", ""), p.get("category", ""))
        it = items.setdefault(name, {"name": name, "loc": loc, "life": life, "dates": set()})
        it["dates"].add(p["_d"])
        it.setdefault("paid", defaultdict(float))[p["_d"]] += money(p.get("paid"))
        if p["_d"] >= it.get("cat_d", p["_d"]):
            it["cat"], it["cat_d"] = p.get("category", "").strip().lower(), p["_d"]
    for o in data["inventory"]:
        d = day(o.get("date", ""))
        if not d or not o.get("item", "").strip():
            continue
        name, loc, life = canon(o["item"], "")
        loc, spot = place(o.get("location", ""), loc)
        it = items.setdefault(name, {"name": name, "loc": loc, "life": life, "dates": set()})
        if "obs" not in it or d >= it["obs"][0]:
            it["obs"] = (d, (o.get("status") or "in").strip().lower(), (o.get("source") or "photo").strip().lower())
            it["loc"], it["spot"] = loc, spot
    trips = len({p["_d"] for p in purchases}) or 1
    shelves = defaultdict(list)
    for it in items.values():
        bought = max(it["dates"]) if it["dates"] else None
        obs = it.get("obs")
        if obs and (not bought or obs[0] >= bought):
            status, since, src = obs[1], obs[0], obs[2]
            fresh = 1.0 if status == "in" else 0.3 if status == "low" else 0
        else:
            age = (today - bought).days
            fresh = max(0.0, 1 - age / it["life"])
            status = "in" if fresh > 0.25 else "low" if fresh > 0 else "out"
            since, src = bought, "receipt"
        times = len(it["dates"])
        ghost = status == "out" and (times >= 3 or (obs is not None and times >= 2))
        if status == "out" and not ghost:
            continue
        shelves[it["loc"]].append({"name": it["name"], "status": status, "fresh": round(fresh, 2),
                                   "since": since.isoformat(), "source": src, "ghost": ghost,
                                   "usual": f"{times} of {trips} trips", "cat": it.get("cat", ""), "spot": it.get("spot"),
                                   "last": bought.isoformat() if bought else None,
                                   "cost": round(it["paid"][bought], 2) if bought else None})
    for loc in shelves:
        shelves[loc].sort(key=lambda x: (x["ghost"], -x["fresh"], x["name"]))
        ghosts = [x for x in shelves[loc] if x["ghost"]]
        if len(ghosts) > 8:
            keep = {g["name"] for g in sorted(ghosts, key=lambda g: -int(g["usual"].split()[0]))[:8]}
            shelves[loc] = [x for x in shelves[loc] if not x["ghost"] or x["name"] in keep]

    year = [s for s in series if s["week"][:4] == str(today.year)]
    return {
        "generated": dt.datetime.now(TZ).strftime("%Y-%m-%dT%H:%M"),
        "today": today.isoformat(),
        "plan": plan,
        "streak": {"current": cur, "best": best, "shopped_this_week": bool(shopped and shopped[-1]),
                   "recent": shopped[-8:]},
        "spend": {"this_week": series[-1]["groceries"] if series else 0, "avg": avg,
                  "weeks": series[-16:], "ytd": round(sum(s["groceries"] for s in year), 2),
                  "flowers_ytd": round(sum(s["flowers"] for s in year), 2)},
        "rewind": rewind,
        "eaten": eaten[:8],
        "shelves": {k: shelves.get(k, []) for k in ("fridge", "freezer", "pantry", "counter")},
    }

# --- render ------------------------------------------------------------------

def render(model, fragment=False):
    tpl = (HERE / "template.html").read_text()
    blob = json.dumps(model, separators=(",", ":")).replace("</", "<\\/")
    page = tpl.replace("/*__DATA__*/null", blob)
    if fragment:
        return page.replace("<!--BODY-->", "")
    head, body = page.split("<!--BODY-->", 1)
    return ('<!doctype html><html lang="en"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
            f'<meta name="robots" content="noindex">{head}</head><body>{body}</body></html>')

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sample")
    ap.add_argument("--out")
    ap.add_argument("--fragment", action="store_true")
    ap.add_argument("--today", help="YYYY-MM-DD, for testing")
    ap.add_argument("--snapshot", help="also write the page's data model (no store names, no notes) as JSON here")
    a = ap.parse_args()
    load_env()
    data = load_sample(a.sample) if a.sample else fetch_sheet()
    today = dt.date.fromisoformat(a.today) if a.today else dt.datetime.now(TZ).date()
    model = build(data, today)
    html = render(model, a.fragment)
    if a.snapshot:
        # Leave out the build timestamp so the file only changes when the data does.
        snap = {k: v for k, v in model.items() if k != "generated"}
        sp = Path(a.snapshot)
        sp.parent.mkdir(parents=True, exist_ok=True)
        sp.write_text(json.dumps(snap, indent=1, sort_keys=True, ensure_ascii=False) + "\n")
    out = Path(a.out or conf("OUT_DIR"))
    out.mkdir(parents=True, exist_ok=True)
    if (HERE / "site").is_dir():  # 3D models, three.js, the item-to-model map
        shutil.copytree(HERE / "site", out, dirs_exist_ok=True)
    tmp = out / "index.html.tmp"
    tmp.write_text(html)
    tmp.replace(out / "index.html")
    print(f"wrote {out / 'index.html'}", file=sys.stderr)

if __name__ == "__main__":
    main()

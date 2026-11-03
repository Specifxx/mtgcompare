# One-off research probe (2026-11-03): which known TCG stores list Union Arena,
# Dragon Ball Super (Fusion World / Masters) and Digimon. Shopify search suggest
# per game + cart.js for currency, two stores at a time, one second apart.
import json, sys, time, urllib.request, urllib.parse, concurrent.futures as cf
UA = {"User-Agent": "Mozilla/5.0 (compatible; CompareEmpireResearch/1.0)"}
GAMES = {
  "ua":  ("union arena", lambda t: "union arena" in t),
  "dbs": ("dragon ball super card game", lambda t: "dragon ball" in t and ("fusion world" in t or "card game" in t or "booster" in t or "masters" in t or " fb0" in t or "fs0" in t or "starter" in t)),
  "fw":  ("fusion world", lambda t: "fusion world" in t or " fb0" in t),
  "dg":  ("digimon card game", lambda t: "digimon" in t and ("card" in t or "booster" in t or "bt" in t or "starter" in t or "ex0" in t or "st" in t)),
}
def get(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=15) as r:
            return r.status, r.read(600000)
    except urllib.error.HTTPError as e: return e.code, b""
    except Exception: return 0, b""
def probe(d):
    out = {"d": d, "status": None, "cur": None}
    for key, (q, keep) in GAMES.items():
        s, b = get(f"https://{d}/search/suggest.json?q={urllib.parse.quote(q)}&resources[type]=product&resources[limit]=10")
        if out["status"] is None: out["status"] = s
        if s != 200: break
        try:
            ps = json.loads(b)["resources"]["results"]["products"]
        except Exception:
            out["status"] = "notshopify"; break
        ps = [p for p in ps if keep(p.get("title", "").lower())]
        out[key] = [(p["title"], p.get("price"), p.get("available")) for p in ps]
        time.sleep(0.5)
    if out["status"] == 200:
        s2, b2 = get(f"https://{d}/cart.js")
        try: out["cur"] = json.loads(b2).get("currency")
        except Exception: pass
    time.sleep(0.5)
    return out
stores = [l.strip() for l in open(sys.argv[1]) if l.strip()]
res = []
with cf.ThreadPoolExecutor(2) as ex:
    for r in ex.map(probe, stores):
        res.append(r); print(r["d"], r["status"], r["cur"], *[len(r.get(k) or []) for k in GAMES], flush=True)
json.dump(res, open("probe-result.json", "w"), indent=1)

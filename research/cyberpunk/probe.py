# One-off research probe (2026-11-01): which known TCG stores list Cyberpunk TCG.
# Two requests per store (Shopify search suggest + cart.js for currency), two stores at a time.
import json, sys, time, urllib.request, urllib.parse, concurrent.futures as cf
UA = {"User-Agent": "Mozilla/5.0 (compatible; CompareEmpireResearch/1.0)"}
def get(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=15) as r:
            return r.status, r.read(400000)
    except urllib.error.HTTPError as e: return e.code, b""
    except Exception: return 0, b""
def probe(d):
    q = urllib.parse.quote("cyberpunk tcg")
    s, b = get(f"https://{d}/search/suggest.json?q={q}&resources[type]=product&resources[limit]=10")
    out = {"d": d, "status": s, "n": None, "titles": [], "cur": None}
    if s == 200:
        try:
            ps = json.loads(b)["resources"]["results"]["products"]
            ps = [p for p in ps if "cyberpunk" in p.get("title","").lower() and "2077" not in p.get("title","")]
            out["n"] = len(ps); out["titles"] = [(p["title"], p.get("price"), p.get("available")) for p in ps]
        except Exception: out["status"] = "notshopify"
        s2, b2 = get(f"https://{d}/cart.js")
        try: out["cur"] = json.loads(b2).get("currency")
        except Exception: pass
    time.sleep(1.0)
    return out
stores = [l.strip() for l in open(sys.argv[1]) if l.strip()]
res = []
with cf.ThreadPoolExecutor(2) as ex:
    for r in ex.map(probe, stores): res.append(r); print(r["d"], r["status"], r["n"], r["cur"], flush=True)
json.dump(res, open("probe-result.json", "w"), indent=1)

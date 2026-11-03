# One-off: Union Arena, Dragon Ball Super and Digimon on TCGCSV (TCGplayer).
import json, urllib.request, collections
UA = {"User-Agent": "CompareEmpireResearch/1.0"}
def j(u):
    with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30) as r: return json.load(r)["results"]
cats = j("https://tcgcsv.com/tcgplayer/categories")
want = [c for c in cats if any(k in (c["name"] + c.get("displayName", "")).lower() for k in ("union arena", "dragon ball", "digimon", "one piece", "gundam", "battle spirits", "weiss", "hololive", "shadowverse"))]
summary = []
for c in want:
    gs = j(f"https://tcgcsv.com/tcgplayer/{c['categoryId']}/groups")
    tot = {"products": 0, "priced": 0, "ge1": 0, "ge10": 0, "ge20": 0, "sealed": 0, "sealed_priced": 0, "sum_market": 0.0}
    top = []
    rec = []
    for g in gs:
        try:
            ps = j(f"https://tcgcsv.com/tcgplayer/{c['categoryId']}/{g['groupId']}/products")
            pr = j(f"https://tcgcsv.com/tcgplayer/{c['categoryId']}/{g['groupId']}/prices")
        except Exception as e:
            print("ERR", c["name"], g["name"], e); continue
        pm = collections.defaultdict(float)
        for x in pr: pm[x["productId"]] = max(pm[x["productId"]], x.get("marketPrice") or 0)
        for p in ps:
            num = any(e["name"] == "Number" for e in p.get("extendedData", []))
            v = pm.get(p["productId"], 0)
            tot["products"] += 1
            if v > 0: tot["priced"] += 1; tot["sum_market"] += v
            if v >= 1: tot["ge1"] += 1
            if v >= 10: tot["ge10"] += 1
            if v >= 20: tot["ge20"] += 1
            if not num:
                tot["sealed"] += 1
                if v > 0: tot["sealed_priced"] += 1
            top.append((v, g["name"], p["name"]))
        rec.append((g.get("publishedOn", ""), g["name"], len(ps)))
    top.sort(reverse=True)
    rec.sort(reverse=True)
    s = {"id": c["categoryId"], "name": c["name"], "display": c.get("displayName"), "groups": len(gs), **tot, "sum_market": round(tot["sum_market"]), "top": top[:12], "recent_groups": rec[:12]}
    summary.append(s)
    print(json.dumps(s), flush=True)
json.dump(summary, open("tcgcsv-result.json", "w"), indent=1)

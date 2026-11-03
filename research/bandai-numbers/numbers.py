# One-off: sample card numbers, rarities, extended fields and sealed names per Bandai category.
import json, urllib.request, collections, random
UA = {"User-Agent": "CompareEmpireResearch/1.0"}
def j(u):
    with urllib.request.urlopen(urllib.request.Request(u, headers=UA), timeout=30) as r: return json.load(r)["results"]
for cat in (81, 80, 63):
    gs = j(f"https://tcgcsv.com/tcgplayer/{cat}/groups")
    print("CAT", cat, "groups", len(gs))
    for g in gs[:4] + random.Random(1).sample(gs, 4):
        print(" G", json.dumps({k: g.get(k) for k in ("groupId", "name", "abbreviation", "publishedOn")}))
    keys = collections.Counter(); rar = collections.Counter(); shapes = collections.Counter()
    samples = []; sealed = []
    for g in random.Random(2).sample(gs, 10):
        ps = j(f"https://tcgcsv.com/tcgplayer/{cat}/{g['groupId']}/products")
        for p in ps:
            ext = {e["name"]: e["value"] for e in p.get("extendedData", [])}
            keys.update(ext.keys())
            if "Number" in ext:
                rar[ext.get("Rarity", "-")] += 1
                import re
                shapes[re.sub(r"\d", "9", re.sub(r"[A-Za-z]", "A", ext["Number"]))] += 1
                if len(samples) < 25 and random.random() < 0.1: samples.append((g["name"], p["name"], ext["Number"], ext.get("Rarity")))
            else:
                if len(sealed) < 25: sealed.append((g["name"], p["name"]))
    print(" EXTKEYS", dict(keys)); print(" RARITY", dict(rar.most_common(30))); print(" SHAPES", dict(shapes.most_common(15)))
    for s in samples: print(" CARD", s)
    for s in sealed: print(" SEALED", s)

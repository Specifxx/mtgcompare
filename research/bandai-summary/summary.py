import json, glob, collections
rows = []
for f in glob.glob("art/*/probe-result.json"): rows += json.load(open(f))
ok = [r for r in rows if r.get("status") == 200]
print("TOTAL", len(rows), "SHOPIFY_OK", len(ok))
games = ["ua", "fw", "dbs", "dg"]
by = collections.defaultdict(lambda: collections.Counter())
hosts = []
for r in ok:
    cur = r.get("cur") or "?"
    n = {g: len(r.get(g) or []) for g in games}
    n["fwany"] = max(n["fw"], n["dbs"])
    for g in ["ua", "fwany", "dg"]:
        if n[g] >= 1: by[cur][g + "1"] += 1
        if n[g] >= 3: by[cur][g + "3"] += 1
    if n["ua"] or n["fwany"] or n["dg"]:
        by[cur]["any"] += 1
        hosts.append((r["d"], cur, n["ua"], n["fwany"], n["dg"]))
for cur, c in sorted(by.items(), key=lambda x: -x[1]["any"]):
    print("CUR", cur, dict(c))
for h in sorted(hosts, key=lambda x: (x[1], x[0])): print("HOST", *h)

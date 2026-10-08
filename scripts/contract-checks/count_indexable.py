"""Indexable pages and oracle hubs under the default policy of section 5 (catalogue floor 1 cent, INDEX floor 50 cents; 4.4, 4.5).
Reads the policy snapshot (111,839 included singles: id, cls, N/F {m,l}, EDHREC rank, Reserved flag, oracle id). Run: python3 count_indexable.py [snapshot-policy.json]
Expected on the 2026-10-07 snapshot: listed class-0 rows 98796, THIN 33640, index-eligible rows 65156, tracked printings 22712, TOP printings 21443, indexable card pages 35050,
oracles with a page 33429, oracles with an INDEXABLE page 21667, indexable hubs (an eligible oracle with >= 2 listed printings) and the largest hub."""
import json, sys
from collections import Counter
rows = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "snapshot-policy.json"))
def plaus(low, m):
    if low is None: return None
    return None if (m is not None and m >= 500 and low < m * 0.25) else low
def unit(x):
    if not x: return None
    m = x["m"]; l = plaus(x["l"], m)
    return (m, False) if m is not None else ((l, True) if l is not None else None)
listed = thin = 0; tracked = set(); top = {}; n_print = Counter(); eligible_oracles = set()
for p in rows:
    n, f = unit(p["N"]), unit(p["F"])
    if p["cls"] != 0 or (not n and not f): continue
    best = max(n[0] if n else 0, f[0] if f else 0)
    pop = max(1 / (1 + p["rank"] / 1500) if p["rank"] else 0, 0.5 if p["res"] else 0) if p["oid"] else 0
    score = min(best, 200000) * (1 + 2 * pop)
    if score < 1: continue
    listed += 1
    is_thin = score < 50
    thin += is_thin
    if p["oid"]:
        n_print[p["oid"]] += 1
        if not is_thin: eligible_oracles.add(p["oid"])
    if is_thin: continue
    if (n and not n[1] and n[0] >= 500) or (f and not f[1] and f[0] >= 500): tracked.add(p["id"])
    mk = max(n[0] if n and not n[1] else 0, f[0] if f and not f[1] else 0)
    if p["oid"] and mk > 0:
        cur = top.get(p["oid"])
        if cur is None or mk > cur[0] or (mk == cur[0] and p["id"] < cur[1]): top[p["oid"]] = (mk, p["id"])
tops = {v[1] for v in top.values()}
hubs = [o for o in eligible_oracles if n_print[o] >= 2]
print(dict(listedClass0=listed, thin=thin, indexEligibleRows=listed - thin, trackedPrintings=len(tracked), topPrintings=len(tops), indexableCardPages=len(tracked | tops),
           oraclesWithAPage=len(n_print), oraclesWithAnIndexablePage=len(eligible_oracles), indexableHubs=len(hubs), largestHub=max(n_print.values())))

#!/bin/bash
# One-off: Cyberpunk TCG on TCGCSV (category id, groups, sample products).
UA="CyberpunkCompare/1.0 (+https://cyberpunkcompare.com)"
curl -s -A "$UA" https://tcgcsv.com/tcgplayer/categories > cats.json
python3 - <<'PY'
import json; d=json.load(open("cats.json"))["results"]
for c in d:
  if "yber" in c["name"] or "yber" in c.get("displayName",""): print("CAT", json.dumps(c))
PY
CAT=$(python3 -c 'import json;print([c["categoryId"] for c in json.load(open("cats.json"))["results"] if "yber" in c["name"]][0])')
curl -s -A "$UA" https://tcgcsv.com/tcgplayer/$CAT/groups > groups.json
python3 -c 'import json;[print("GROUP",json.dumps(g)) for g in json.load(open("groups.json"))["results"]]'
for G in $(python3 -c 'import json;print(" ".join(str(g["groupId"]) for g in json.load(open("groups.json"))["results"]))'); do
  curl -s -A "$UA" https://tcgcsv.com/tcgplayer/$CAT/$G/products > p.json
  curl -s -A "$UA" https://tcgcsv.com/tcgplayer/$CAT/$G/prices > pr.json
  python3 - "$G" <<'PY'
import json,sys,collections
ps=json.load(open("p.json"))["results"]; pr=json.load(open("pr.json"))["results"]
pm=collections.defaultdict(list)
for x in pr: pm[x["productId"]].append(x)
print("G",sys.argv[1],"products",len(ps),"prices",len(pr))
keys=collections.Counter(e["name"] for p in ps for e in p.get("extendedData",[]))
print("EXTKEYS",dict(keys))
rar=collections.Counter(next((e["value"] for e in p.get("extendedData",[]) if e["name"]=="Rarity"),"-") for p in ps)
print("RARITIES",dict(rar))
subs=collections.Counter(x["subTypeName"] for x in pr); print("SUBTYPES",dict(subs))
for p in ps[:6]+[p for p in ps if not any(e["name"]=="Number" for e in p.get("extendedData",[]))][:8]:
  print("P",json.dumps({k:p[k] for k in ("productId","name","cleanName","imageCount","url")}), json.dumps(p.get("extendedData",[]))[:400], json.dumps(pm.get(p["productId"]))[:300])
vals=sorted(((max([x.get("marketPrice") or 0 for x in pm[p["productId"]]] or [0])),p["name"]) for p in ps)
print("TOP",vals[-12:]); print("N>=10",sum(1 for v,_ in vals if v>=10),"N>=1",sum(1 for v,_ in vals if v>=1))
PY
done

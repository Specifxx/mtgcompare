"""TEMP (2026-10-28): which known stores have Nendoroid/figma/scale-figure or Gunpla collections, and where their
public Shopify data carries a JAN. One request a second per runner (Shopify 429s a runner IP that goes faster).
Usage: probe.py <shard> <shards>. Writes figprobe/out-<shard>.json. Research only."""
import json, re, sys, time, urllib.request, urllib.error, ssl

UA = "Mozilla/5.0 (compatible; CompareEmpireProbe/1.0; store survey)"
CTX = ssl.create_default_context()
JAN = re.compile(r"(?<!\d)4[59]\d{11}(?!\d)")
FIGC = re.compile(r"nendoroid|figma|scale[- ]figure|anime[- ]figure|figures?$|figurine|prize[- ]figure|pop[- ]up[- ]parade", re.I)
KITC = re.compile(r"gunpla|model[- ]kit|gundam[- ]kit|plastic[- ]model|bandai[- ]hobby", re.I)
FIG = re.compile(r"nendoroid|figma|pop up parade|\b1/[4-8]\b|scale figure|figure", re.I)
KIT = re.compile(r"gunpla|\b(hg|hguc|mg|rg|pg|eg|sd|mgsd)\b|entry grade|high grade|master grade|real grade|perfect grade|model kit", re.I)
calls = 0

def get(url, limit=30_000_000):
    global calls
    time.sleep(1.0); calls += 1
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json,*/*"})
    try:
        with urllib.request.urlopen(req, timeout=25, context=CTX) as r:
            return r.status, r.read(limit).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, ""
    except Exception as e:
        return None, type(e).__name__

def js(body, key=None):
    try:
        d = json.loads(body); return d[key] if key else d
    except Exception: return None

def jan_where(p):
    w = []
    for v in p.get("variants") or []:
        if v.get("barcode") and JAN.search(str(v["barcode"])): w.append("barcode")
        if v.get("sku") and JAN.search(str(v["sku"])): w.append("sku")
    if not w and JAN.search(p.get("body_html") or ""): w.append("body")
    if not w:
        tags = p.get("tags"); tags = " ".join(tags) if isinstance(tags, list) else str(tags or "")
        if JAN.search(tags): w.append("tags")
    return w

def scan_collection(root, handle, rx, kind, out):
    n = jan = 0; where = {}; samples = []
    for page in range(1, 5):
        s, body = get(f"{root}/collections/{handle}/products.json?limit=250&page={page}")
        prods = js(body, "products")
        if not prods: break
        for p in prods:
            if not rx.search(p.get("title") or ""): continue
            n += 1
            w = jan_where(p)
            if w: jan += 1
            for x in w: where[x] = where.get(x, 0) + 1
            if len(samples) < 3: samples.append({"handle": p.get("handle"), "t": (p.get("title") or "")[:80], "sku": ((p.get("variants") or [{}])[0].get("sku")), "jan": bool(w)})
        if len(prods) < 250: break
    out[kind] = {"collection": handle, "n": n, "jan": jan, "where": where, "samples": samples}
    # Does the single-product endpoint carry variants[].barcode for a product with no JAN in the listing?
    for smp in samples:
        if not smp["jan"] and smp["handle"]:
            s, body = get(f"{root}/products/{smp['handle']}.json")
            p = js(body, "product") or {}
            vs = p.get("variants") or [{}]
            out[kind]["singleEndpoint"] = {"status": s, "hasBarcodeKey": "barcode" in vs[0], "barcode": vs[0].get("barcode")}
            break

def probe(store):
    root = store["base"].rstrip("/")
    out = dict(store)
    s, body = get(f"{root}/collections.json?limit=250")
    cols = js(body, "collections")
    out["collectionsStatus"] = s
    if cols is None: return out
    out["readable"] = True
    figc = [c for c in cols if FIGC.search(c.get("handle", "") + " " + c.get("title", "")) and (c.get("products_count") or 1) > 0]
    kitc = [c for c in cols if KITC.search(c.get("handle", "") + " " + c.get("title", ""))]
    out["figCollections"] = [c["handle"] for c in figc][:6]
    out["kitCollections"] = [c["handle"] for c in kitc][:6]
    if figc or kitc:
        s, cart = get(f"{root}/cart.js")
        out["currency"] = (js(cart) or {}).get("currency")
    if figc:
        best = sorted(figc, key=lambda c: (0 if re.search("nendoroid|figma|scale", c["handle"], re.I) else 1, -(c.get("products_count") or 0)))[0]
        scan_collection(root, best["handle"], FIG, "fig", out)
    if kitc:
        scan_collection(root, kitc[0]["handle"], KIT, "kit", out)
    return out

shard, shards = int(sys.argv[1]), int(sys.argv[2])
stores = json.load(open("figprobe/stores.json"))[shard::shards]
res = []
for st in stores:
    res.append(probe(st))
    if calls % 100 < 2: print(shard, len(res), calls, flush=True)
json.dump(res, open(f"figprobe/out-{shard}.json", "w"), indent=0)

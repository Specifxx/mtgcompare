"""TEMP (2026-10-28): do the stores we know (plus figure specialists) sell Nendoroid/figma and Gunpla, and does
their public Shopify data carry a JAN barcode we could match on? Writes figprobe/out.json. Research only."""
import json, re, time, urllib.request, urllib.error, ssl, concurrent.futures as cf

UA = "Mozilla/5.0 (compatible; CompareEmpireProbe/1.0; store survey)"
CTX = ssl.create_default_context()
JAN = re.compile(r"(?<!\d)4[59]\d{11}(?!\d)")
FIG = re.compile(r"nendoroid|figma|pop up parade|\b1/[4-8]\b|scale figure", re.I)
KIT = re.compile(r"gunpla|\b(hg|hguc|mg|rg|pg|eg|sd)\b.*gundam|gundam.*\b(hg|hguc|mg|rg|pg|eg)\b|entry grade|high grade|master grade|real grade|perfect grade", re.I)

def get(url, limit=30_000_000):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json,*/*"})
    try:
        with urllib.request.urlopen(req, timeout=25, context=CTX) as r:
            return r.status, r.geturl(), r.read(limit).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, url, ""
    except Exception as e:
        return None, url, type(e).__name__

def suggest(root, q):
    s, _, body = get(f"{root}/search/suggest.json?q={q}&resources[type]=product&resources[limit]=10")
    try: return len(json.loads(body)["resources"]["results"]["products"])
    except Exception: return None if s != 200 else 0

def jan_of(p):
    hits = []
    for v in p.get("variants") or []:
        for k in ("barcode", "sku"):
            if v.get(k) and JAN.search(str(v[k])): hits.append(k)
    if not hits and JAN.search(p.get("body_html") or ""): hits.append("body")
    if not hits and JAN.search(" ".join(p.get("tags") or []) if isinstance(p.get("tags"), list) else str(p.get("tags") or "")): hits.append("tags")
    return hits

def probe(store):
    root = store["base"].rstrip("/")
    out = dict(store)
    # suggest.json came back unreadable from runners for ~95% of stores, so scan products.json directly.
    stats = {"fig": 0, "figJan": 0, "kit": 0, "kitJan": 0, "barcodeKey": False, "where": {}, "samples": []}
    for page in range(1, 9):
        time.sleep(1.0)
        s, _, body = get(f"{root}/products.json?limit=250&page={page}")
        try: prods = json.loads(body)["products"]
        except Exception:
            stats["readError"] = s
            if page == 1 and s != 429:
                hs, hf, hb = get(root, limit=300000)
                b = hb.lower() if isinstance(hb, str) else ""
                stats["home"] = hs
                stats["platform"] = "shopify" if "cdn.shopify.com" in b else "woocommerce" if "woocommerce" in b else "magento" if "mage-init" in b else "bigcommerce" if "bigcommerce" in b else ("challenge" if ("verifying your connection" in b or "just a moment" in b) else "other")
                if stats["platform"] in ("woocommerce", "other"):
                    ws, _, wb = get(f"{root}/wp-json/wc/store/v1/products?search=nendoroid&per_page=100")
                    try:
                        items = json.loads(wb); stats["platform"] = "woocommerce"; stats["wooFig"] = len(items)
                        stats["wooFigJan"] = sum(1 for it in items if JAN.search(str(it.get("sku") or "") + " " + str(it.get("description") or "")))
                    except Exception: pass
            break
        stats["scanned"] = stats.get("scanned", 0) + len(prods)
        if not prods: break
        for p in prods:
            vs = p.get("variants") or []
            if vs and "barcode" in vs[0]: stats["barcodeKey"] = True
            title = p.get("title") or ""
            kind = "fig" if FIG.search(title) else ("kit" if KIT.search(title) else None)
            if not kind: continue
            stats[kind] += 1
            j = jan_of(p)
            if j:
                stats[kind + "Jan"] += 1
                for w in j: stats["where"][w] = stats["where"].get(w, 0) + 1
            if len(stats["samples"]) < 3:
                stats["samples"].append({"t": title[:80], "sku": (vs[0].get("sku") if vs else None), "bc": (vs[0].get("barcode") if vs else None)})
    out.update(stats)
    return out

stores = json.load(open("figprobe/stores.json"))
with cf.ThreadPoolExecutor(3) as ex: res = list(ex.map(probe, stores))
json.dump(res, open("figprobe/out.json", "w"), indent=0)

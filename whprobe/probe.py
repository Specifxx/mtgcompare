"""TEMP (2026-10-28): which Warhammer discount stores expose a readable product feed, and do the
stores MTG Compare already reads also sell Warhammer? Output: whprobe/out/*.json. Removed afterwards."""
import json, re, sys, time, urllib.request, urllib.error, ssl, concurrent.futures as cf

UA = "Mozilla/5.0 (compatible; CompareEmpireProbe/1.0; store survey)"
CTX = ssl.create_default_context()

def get(url, limit=400000):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    try:
        with urllib.request.urlopen(req, timeout=20, context=CTX) as r:
            return r.status, r.geturl(), dict(r.headers), r.read(limit).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        try: body = e.read(20000).decode("utf-8", "replace")
        except Exception: body = ""
        return e.code, url, dict(e.headers or {}), body
    except Exception as e:
        return None, url, {}, type(e).__name__

def platform(headers, body):
    h = {k.lower(): v for k, v in headers.items()}
    b = body.lower()
    if "x-shopid" in h or "cdn.shopify.com" in b or "shopify.theme" in b: return "shopify"
    if "woocommerce" in b or "wc-block" in b: return "woocommerce"
    if "x-magento-tags" in h or "mage-init" in b or "magento" in b: return "magento"
    if "bigcommerce" in b: return "bigcommerce"
    if "prestashop" in b: return "prestashop"
    if "shopware" in b: return "shopware"
    if "wix.com" in b: return "wix"
    if "squarespace" in b: return "squarespace"
    if "wp-content" in b: return "wordpress"
    return "other"

def blocked(status, body):
    b = body.lower() if isinstance(body, str) else ""
    return status in (403, 429, 503) or "just a moment" in b or "cf-chl" in b or "captcha" in b or "verifying your connection" in b

GW = re.compile(r"warhammer|games workshop|citadel|combat patrol|age of sigmar|kill team", re.I)

def shopify_scan(root):
    """Count Games Workshop products from the public products.json (vendor/title/tags), max 30 pages."""
    gw = total = 0
    for page in range(1, 9):
        time.sleep(1.5)
        s, _, _, body = get(f"{root}/products.json?limit=250&page={page}", limit=20_000_000)
        try: prods = json.loads(body)["products"]
        except Exception: return (gw, total, page > 1)
        if not prods: break
        total += len(prods)
        for p in prods:
            text = " ".join([p.get("vendor") or "", p.get("title") or "", " ".join(p.get("tags") or []) if isinstance(p.get("tags"), list) else str(p.get("tags") or "")])
            if GW.search(text): gw += 1
    return (gw, total, True)

def woo_scan(root):
    n = 0
    for q in ("warhammer", "citadel", "combat%20patrol"):
        s, _, _, body = get(f"{root}/wp-json/wc/store/v1/products?search={q}&per_page=100")
        try: n += len(json.loads(body))
        except Exception: pass
    return n

def probe(base):
    base = base.rstrip("/")
    out = {"base": base}
    # Feeds first: Shopify challenges HTML pages from datacenter IPs but serves products.json (our importers rely on it).
    ps, pfinal, _, pb = get(f"{base}/products.json?limit=1")
    if ps == 200 and pb.lstrip().startswith("{") and '"products"' in pb[:50]:
        root = re.match(r"https?://[^/]+", pfinal).group(0)
        out.update(status=200, platform="shopify", feed=True, final=root)
        gw, total, ok = shopify_scan(root)
        out.update(gw=gw, scanned=total)
        return out
    ws, wfinal, _, wb = get(f"{base}/wp-json/wc/store/v1/products?per_page=1")
    if ws == 200 and wb.lstrip().startswith("["):
        root = re.match(r"https?://[^/]+", wfinal).group(0)
        out.update(status=200, platform="woocommerce", feed=True, final=root, gw=woo_scan(root))
        return out
    s, final, headers, body = get(base)
    out.update(status=s, final=final, feed=False)
    if s is None:
        out["error"] = body; return out
    m = re.search(r"<title[^>]*>(.*?)</title>", body, re.S | re.I)
    out["title"] = (m.group(1).strip()[:90] if m else "")
    out["platform"] = platform(headers, body)
    out["blocked"] = blocked(s, body)
    out["feedStatus"] = [ps, ws]
    return out

def main():
    mode = sys.argv[1]
    if mode == "candidates":
        rows = [l.rstrip("\n").split("\t") for l in open("whprobe/candidates.tsv") if l.strip()]
        def one(r):
            region, name, doms = r
            tries = []
            for d in doms.split():
                p = probe("https://" + d)
                if p["status"] is None or (p["status"] >= 400 and not p.get("feed")): p2 = probe("https://www." + d) if not d.startswith("store.") else p; p = p2 if p2.get("status") else p
                tries.append(p)
                if p.get("feed") or (p["status"] and p["status"] < 400): break
            return {"region": region, "name": name, "tries": tries}
        with cf.ThreadPoolExecutor(2) as ex: res = list(ex.map(one, rows))
    else:
        stores = json.load(open("src/data/stores.json"))
        def one(s):
            p = probe(s["base"]); p.update(name=s["name"], market=s["market"]); return p
        with cf.ThreadPoolExecutor(12) as ex: res = list(ex.map(one, stores))
    json.dump(res, open(f"whprobe/out/{mode}.json", "w"), indent=1)

main()

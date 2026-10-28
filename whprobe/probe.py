"""TEMP (2026-10-28): which Warhammer discount stores expose a readable product feed, and do the
stores MTG Compare already reads also sell Warhammer? Output: whprobe/out/*.json. Removed afterwards."""
import json, re, sys, urllib.request, urllib.error, ssl, concurrent.futures as cf

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
    if "magento" in b or "mage/" in b: return "magento"
    if "bigcommerce" in b: return "bigcommerce"
    if "prestashop" in b: return "prestashop"
    if "shopware" in b: return "shopware"
    if "wp-content" in b: return "wordpress"
    return "other"

def blocked(status, body):
    b = body.lower() if isinstance(body, str) else ""
    return status in (403, 429, 503) or "just a moment" in b or "cf-chl" in b or "captcha" in b

def shopify_count(base, q):
    s, _, _, body = get(f"{base}/search/suggest.json?q={q}&resources[type]=product&resources[limit]=10")
    try: return len(json.loads(body)["resources"]["results"]["products"])
    except Exception: return None

def woo_count(base, q):
    s, _, _, body = get(f"{base}/wp-json/wc/store/v1/products?search={q}&per_page=20")
    try: return len(json.loads(body))
    except Exception: return None

def probe(base):
    s, final, headers, body = get(base)
    out = {"base": base, "status": s, "final": final}
    if s is None:
        out["error"] = body; return out
    m = re.search(r"<title[^>]*>(.*?)</title>", body, re.S | re.I)
    out["title"] = (m.group(1).strip()[:90] if m else "")
    out["platform"] = platform(headers, body)
    out["blocked"] = blocked(s, body)
    root = re.match(r"https?://[^/]+", final).group(0)
    if out["platform"] == "shopify":
        ps, _, _, pb = get(f"{root}/products.json?limit=1")
        out["feed"] = ps == 200 and pb.lstrip().startswith("{")
        out["wh"] = shopify_count(root, "warhammer")
        out["gw"] = shopify_count(root, "combat+patrol")
    elif out["platform"] in ("woocommerce", "wordpress"):
        ws, _, _, wb = get(f"{root}/wp-json/wc/store/v1/products?per_page=1")
        out["feed"] = ws == 200 and wb.lstrip().startswith("[")
        if out["feed"]:
            out["platform"] = "woocommerce"
            out["wh"] = woo_count(root, "warhammer")
            out["gw"] = woo_count(root, "combat%20patrol")
    else:
        out["feed"] = False
    return out

def main():
    mode = sys.argv[1]
    if mode == "candidates":
        rows = [l.rstrip("\n").split("\t") for l in open("whprobe/candidates.tsv") if l.strip()]
        def one(r):
            region, name, doms = r
            tries = []
            for d in doms.split():
                p = probe("https://" + (d if d.startswith("store.") else "www." + d))
                if p["status"] is None: p = probe("https://" + d)
                tries.append(p)
                if p["status"] and p["status"] < 400: break
            return {"region": region, "name": name, "tries": tries}
        with cf.ThreadPoolExecutor(8) as ex: res = list(ex.map(one, rows))
    else:
        stores = json.load(open("src/data/stores.json"))
        def one(s):
            p = probe(s["base"]); p.update(name=s["name"], market=s["market"]); return p
        with cf.ThreadPoolExecutor(10) as ex: res = list(ex.map(one, stores))
    json.dump(res, open(f"whprobe/out/{mode}.json", "w"), indent=1)

main()

// IndexNow key file (Bing, Yandex, Seznam, Naver). Engines fetch it to verify
// that pings for this host are ours. The key is public by design; set
// INDEXNOW_KEY (the same value RiftCompare uses is fine — a key is verified per
// host). Without it this route 404s and IndexNow is simply off.
export const dynamic = "force-static";

export function GET() {
  const key = process.env.INDEXNOW_KEY;
  if (!key) return new Response("Not found", { status: 404 });
  return new Response(key, { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

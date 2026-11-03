// IndexNow (Bing, Yandex…) key file. scripts/indexnow-submit.ts pings with
// keyLocation=<site>/indexnow-key.txt, so the key never has to be a filename.
export const dynamic = "force-dynamic";
export function GET() {
  return new Response(process.env.INDEXNOW_KEY ?? "", { headers: { "Content-Type": "text/plain", "Cache-Control": "public, s-maxage=86400" } });
}

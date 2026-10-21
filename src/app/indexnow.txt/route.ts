import { indexNowKey } from "@/lib/indexnow";

// The IndexNow key file. Bing, Yandex, Seznam and Naver fetch it to check that a
// submission for www.dexcompare.app is ours (src/lib/indexnow.ts). Public by
// design; no data, so it is built once per deploy.
export const dynamic = "force-static";

export function GET() {
  return new Response(indexNowKey(), { headers: { "Content-Type": "text/plain; charset=utf-8" } });
}

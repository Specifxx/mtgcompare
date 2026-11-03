// AdSense ads.txt (same publisher as Rift Compare; the id is public).
export const revalidate = 86400;
export function GET() {
  const id = (process.env.NEXT_PUBLIC_ADSENSE_CLIENT_ID || "ca-pub-6842128782879909").replace(/^ca-/, "");
  return new Response(`google.com, ${id}, DIRECT, f08c47fec0942fa0\n`, { headers: { "Content-Type": "text/plain" } });
}

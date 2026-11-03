"use client";
import { useState } from "react";
import { money } from "@/lib/format";

interface Match { id: number; slug: string; name: string; set: string; marketUsd: number | null }
type Side = { qty: number; query: string; match: Match | null }[];

async function value(text: string): Promise<Side> {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 60);
  return Promise.all(
    lines.map(async (l) => {
      const m = l.match(/^(\d{1,3})\s*x?\s+(.+)$/i) ?? l.match(/^(.+?)\s+x\s?(\d{1,3})$/i);
      const qty = m ? Number(/^\d/.test(l) ? m[1] : m[2]) : 1;
      const query = m ? (/^\d/.test(l) ? m[2] : m[1]) : l;
      const r = await fetch(`/api/lookup?q=${encodeURIComponent(query)}`);
      return { qty, query, match: ((await r.json()) as { match: Match | null }).match };
    }),
  );
}
const total = (s: Side) => s.reduce((a, l) => a + (l.match?.marketUsd ?? 0) * l.qty, 0);

export function Trade() {
  const [a, setA] = useState("");
  const [b, setB] = useState("");
  const [res, setRes] = useState<[Side, Side] | null>(null);
  const ta = "rounded-lg border border-ink-700 bg-ink-900 p-3 font-mono text-sm w-full";
  const box = (label: string, s: Side) => (
    <div className="card-surface p-4">
      <p className="text-xs uppercase text-muted">{label}</p>
      <p className="text-2xl font-black">{money(total(s))}</p>
      <ul className="mt-2 text-sm">{s.map((l, i) => <li key={i} className="flex justify-between border-t border-ink-800 py-1"><span>{l.qty}× {l.match ? <a className="hover:underline" href={`/card/${l.match.slug}`}>{l.match.name}</a> : <span className="text-down">{l.query}?</span>}</span><span>{money((l.match?.marketUsd ?? 0) * l.qty)}</span></li>)}</ul>
    </div>
  );
  return (
    <div className="mt-5">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-semibold">You give<textarea rows={8} className={ta} value={a} onChange={(e) => setA(e.target.value)} /></label>
        <label className="text-sm font-semibold">You get<textarea rows={8} className={ta} value={b} onChange={(e) => setB(e.target.value)} /></label>
      </div>
      <button className="btn-primary mt-3" onClick={async () => setRes([await value(a), await value(b)])}>Value the trade</button>
      {res && (
        <>
          <div className="mt-5 grid gap-4 md:grid-cols-2">{box("You give", res[0])}{box("You get", res[1])}</div>
          <p className="mt-4 text-lg font-bold">
            {(() => { const d = total(res[1]) - total(res[0]); return d === 0 ? "Even trade." : d > 0 ? `You gain ${money(d)} in market value.` : `You give up ${money(-d)} in market value.`; })()}
          </p>
        </>
      )}
    </div>
  );
}

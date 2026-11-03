"use client";
import { useEffect, useState } from "react";
import Link from "@/components/Link";
import { useMarket } from "@/components/ClientPrefs";
import { BasketResult, type Result } from "@/app/tools/best-basket/Basket";
import { decodeList, encodeList } from "@/lib/share";

export function SharedList() {
  const { market } = useMarket();
  const [ids, setIds] = useState<string | null>(null);
  const [res, setRes] = useState<Result | null | "error">(null);
  useEffect(() => {
    setIds(encodeList(decodeList(new URLSearchParams(location.search).get("i"))));
  }, []);
  useEffect(() => {
    if (!ids) return;
    let live = true;
    setRes(null);
    fetch("/api/basket", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids, market }) })
      .then((r) => (r.ok ? (r.json() as Promise<Result>) : Promise.reject()))
      .then((d) => live && setRes(d))
      .catch(() => live && setRes("error"));
    return () => {
      live = false;
    };
  }, [ids, market]);
  if (ids === "") return <p className="mt-6 text-muted">This link has no cards on it. <Link className="link" href="/tools/best-basket">Price your own list</Link>.</p>;
  return (
    <div className="mt-5 min-w-0">
      {res === null && <p className="text-muted">Pricing the list…</p>}
      {res === "error" && <p className="text-muted">The list did not load. Try again in a moment.</p>}
      {res && res !== "error" && <BasketResult res={res} market={market} share />}
      <p className="mt-6 text-sm text-muted">
        <Link className="link" href="/tools/best-basket">Price your own deck or want list</Link> in Best Basket.
      </p>
    </div>
  );
}

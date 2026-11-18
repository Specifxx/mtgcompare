"use client";

// "Which tool should we build here next?" (owner, 2026-11-18: the other sites lack RiftCompare's tools). A quiet, inline
// demand test, not a promise and not a pop-up: four of RiftCompare's tools, one tap records which one this visitor wants
// (`tool_interest`, Vercel Web Analytics) and the box thanks them. Once per visitor (localStorage); nothing is stored about
// them and nothing is sent anywhere else. Placed low on product pages, never beside a price or a buy button, never in the
// quick view. Read about 4 Dec: build a tool on a site only if it clears 5 taps per 1,000 product viewers.
// The same file sits on every site that runs the test (strategy/premium-network-plan-2026-11-18.html).
import { useEffect, useState, type CSSProperties } from "react";
import { track } from "@/lib/track";

export const TOOL_INTEREST_KEY = "tool-interest";

export const TOOLS = [
  { id: "basket", name: "Best Basket", what: "Paste a list, get the cheapest delivered total across stores" },
  { id: "box-ev", name: "Box value", what: "What a box is worth opened, from today's single-card prices" },
  { id: "pulls", name: "Pull tracker", what: "Log your packs and see what you opened is worth" },
  { id: "set-tracker", name: "Set tracker", what: "Tick off a set and see what's left to buy, cheapest first" },
] as const;

export type ToolId = (typeof TOOLS)[number]["id"];

const box: CSSProperties = { border: "1px solid rgba(127,127,127,.35)", borderRadius: 10, padding: "12px 14px" };
const btn: CSSProperties = { display: "block", width: "100%", textAlign: "left", padding: "8px 10px", marginTop: 8, borderRadius: 8, border: "1px solid rgba(127,127,127,.45)", background: "transparent", color: "inherit", font: "inherit", cursor: "pointer" };

export function ToolInterest({ page, className }: { page: string; className?: string }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      setPicked(window.localStorage.getItem(TOOL_INTEREST_KEY));
    } catch {
      /* private mode: show the question, count nothing twice in this visit */
    }
    setReady(true);
  }, []);

  if (!ready) return null;

  const choose = (id: ToolId) => {
    setPicked(id);
    try {
      window.localStorage.setItem(TOOL_INTEREST_KEY, id);
    } catch {
      /* ignore */
    }
    try {
      track("tool_interest", { tool: id, page });
    } catch {
      /* analytics must never get in the way of the page */
    }
  };

  const chosen = TOOLS.find((t) => t.id === picked);
  return (
    <aside className={className} style={box} aria-label="Which tool should we build next">
      {chosen ? (
        <p style={{ margin: 0, fontSize: 14 }}>
          Thanks, your vote for <b>{chosen.name}</b> is counted. We build the most wanted tool first.
        </p>
      ) : (
        <>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Which tool should we build here next?</p>
          <p style={{ margin: "2px 0 0", fontSize: 12, opacity: 0.75 }}>One tap. It isn&rsquo;t built yet: the most wanted one goes first.</p>
          {TOOLS.map((t) => (
            <button key={t.id} type="button" style={btn} onClick={() => choose(t.id)}>
              <span style={{ fontWeight: 600 }}>{t.name}</span>
              <span style={{ display: "block", fontSize: 12, opacity: 0.75 }}>{t.what}</span>
            </button>
          ))}
        </>
      )}
    </aside>
  );
}

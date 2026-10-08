"use client";

import Link from "next/link";
import { useId } from "react";
import { keywordOfName, splitKeywordText } from "@/lib/keywords";
import { Tooltip } from "./ui/Tooltip";

// Recognise a keyword in a card's rules text ("Flying", "first strike", "Ward {2}") and link it to its /keywords/[slug] page with a hover/tap definition
// (RiftCompare's KeywordText). Built from KEYWORDS through splitKeywordText, so a word with no keyword page is never linked: no dead link and no tooltip for
// a page that does not exist. The text is never altered, only wrapped.
function KeywordChip({ name }: { name: string }) {
  const id = useId();
  const entry = keywordOfName(name);
  if (!entry) return <>{name}</>;
  return (
    <Tooltip
      id={id}
      content={
        <>
          {entry.summary.length > 140 ? `${entry.summary.slice(0, 140)}…` : entry.summary} <span className="text-brand-400">Read more →</span>
        </>
      }
    >
      {({ revealed, reveal, ...trigger }) => (
        <Link
          href={`/keywords/${entry.slug}`}
          className="font-semibold text-brand-400 underline decoration-dotted underline-offset-2 hover:text-brand-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400"
          {...trigger}
          onClick={(e) => {
            // First tap on a touch device reveals the definition; a second tap
            // (or a mouse click, which never reveals via touch) follows the link.
            if (!revealed) {
              e.preventDefault();
              reveal();
            }
          }}
        >
          {name}
        </Link>
      )}
    </Tooltip>
  );
}

export function KeywordText({ text, className }: { text: string; className?: string }) {
  const parts = splitKeywordText(text);
  if (parts.length === 1) return <span className={className}>{text}</span>;
  return (
    <span className={className}>
      {parts.map((part, i) => (i % 2 === 1 ? <KeywordChip key={i} name={part} /> : part))}
    </span>
  );
}

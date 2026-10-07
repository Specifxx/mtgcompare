"use client";

import { useState } from "react";
import { csvRow } from "@/lib/admin-csv";

export type ExportUser = {
  name: string;
  email: string;
  registered: string;
  lastSignIn: string;
  verified: boolean;
  plan: "plus" | "premium" | "none"; // the active paid tier
};

// Copy/CSV export for the admin accounts list (ported from RiftCompare), so the
// owner can paste emails into their own mail client without touching the
// database. Rows arrive serialised from the server; no calls are made here.
export function AccountsExport({ rows }: { rows: ExportUser[] }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(label);
      setTimeout(() => setCopied(null), 1800);
    });
  };

  const downloadCsv = () => {
    const header = "name,email,registered,last_sign_in,verified,plan";
    const lines = rows.map((u) => csvRow([u.name, u.email, u.registered, u.lastSignIn, u.verified ? "yes" : "no", u.plan]));
    const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "opcompare-users.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" onClick={() => copy(rows.map((u) => u.email).join(", "), "comma")} className="btn-ghost min-h-9 text-xs">
        {copied === "comma" ? "✓ Copied" : "Copy emails (comma)"}
      </button>
      <button type="button" onClick={() => copy(rows.map((u) => u.email).join("\n"), "list")} className="btn-ghost min-h-9 text-xs">
        {copied === "list" ? "✓ Copied" : "Copy emails (one per line)"}
      </button>
      <button type="button" onClick={downloadCsv} className="btn-ghost min-h-9 text-xs">
        Download CSV
      </button>
      <span className="text-xs text-slate-500">{rows.length} loaded</span>
    </div>
  );
}

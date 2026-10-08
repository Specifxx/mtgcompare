import Link from "next/link";
import {
  CONTACT_EMAIL,
  DATA_ATTRIBUTION,
  DISCORD_URL,
  FAN_CONTENT_DISCLAIMER,
  FAN_CONTENT_POLICY_URL,
  SCRYFALL_URL,
  SISTER_SITES,
  SITE_NAME,
  UNOFFICIAL_FAN_SITE_NOTICE,
} from "@/lib/site";
import { FooterNav } from "./FooterNav";
import { PrivacySettingsLink } from "./PrivacySettingsLink";
import { ShareRow } from "./ShareRow";

// The site footer — RiftCompare's footer markup (inline in its layout.tsx),
// moved into one component. The rail reservation sits on the <footer> itself
// and the inner box is a plain content container, so footer content lines up
// with <main> at every width and border-t still spans under the fixed rail.
//
// Order: the newsletter slot (collection-alerts' NewsletterSignup, rendered
// only while getEmailStatus() is "on" — never an email field while nothing
// sends), the site map, the share band, the always-visible link row, the
// sister-site line, the site line, the affiliate disclosure, the data
// attribution, Wizards of the Coast's Fan Content sentence, the
// unofficial-fan-site notice and the copyright. No "·" separators: items are
// spaced by the row's own gap, so nothing dangles at a line end on a phone.
//
// The legal wording is imported from src/lib/site.ts, never retyped here: the
// Fan Content Policy asks for its sentence verbatim, and the same strings sit on
// About and Terms. Only the link is added, on the words the sentence already has.
const linkClass = "underline hover:text-slate-300";
/** The sentence with its first `word` turned into a link: the words themselves are the constant's. */
function linkFirst(text: string, word: string, href: string): React.ReactNode {
  const i = text.indexOf(word);
  if (i < 0) return text;
  return (
    <>
      {text.slice(0, i)}
      <a href={href} target="_blank" rel="noopener noreferrer" className={linkClass}>
        {word}
      </a>
      {text.slice(i + word.length)}
    </>
  );
}

export function Footer({ newsletter = null }: { newsletter?: React.ReactNode }) {
  return (
    <footer className="border-t border-ink-800 py-8 pl-[var(--sidenav-w)] text-center text-xs text-slate-500">
      <div className="container-app">
        {newsletter}
        <FooterNav />
        <div className="mb-5 flex flex-col items-center gap-2 border-y border-ink-800/70 py-4">
          <span className="text-xs text-slate-400">Find {SITE_NAME} useful? Send it to someone who plays Magic.</span>
          <ShareRow source="footer" size="sm" className="justify-center" />
        </div>
        <div className="mb-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm sm:gap-x-6">
          <Link href="/" className="tap-link text-slate-300 hover:text-brand-400">Home</Link>
          <Link href="/blog" className="tap-link text-slate-300 hover:text-brand-400">Blog</Link>
          <Link href="/guides" className="tap-link text-slate-300 hover:text-brand-400">Guides</Link>
          <Link href="/tools" className="tap-link text-slate-300 hover:text-brand-400">Tools</Link>
          <Link href="/about" className="tap-link text-slate-300 hover:text-brand-400">About us</Link>
          <Link href="/editorial-policy" className="tap-link text-slate-300 hover:text-brand-400">Editorial policy</Link>
          <Link href="/methodology" className="tap-link text-slate-300 hover:text-brand-400">Methodology</Link>
          <Link href="/authors" className="tap-link text-slate-300 hover:text-brand-400">Who writes this</Link>
          <Link href="/contact" className="tap-link text-slate-300 hover:text-brand-400">Contact &amp; feedback</Link>
          <Link href="/privacy" className="tap-link text-slate-300 hover:text-brand-400">Privacy policy</Link>
          <Link href="/terms" className="tap-link text-slate-300 hover:text-brand-400">Terms of service</Link>
          <PrivacySettingsLink />
          {DISCORD_URL ? (
            <a href={DISCORD_URL} target="_blank" rel="noopener noreferrer" className="tap-link text-slate-300 hover:text-[#5865F2]">
              Discord
            </a>
          ) : null}
          <a href={`mailto:${CONTACT_EMAIL}`} className="tap-link text-gold hover:underline">{CONTACT_EMAIL}</a>
        </div>
        {/* Cross-promotion: the owner's sister sites (RiftCompare, OP Compare). */}
        <p className="mb-2">
          Playing {SISTER_SITES.map((s) => s.game).join(" or ")} too? Our sister sites{" "}
          {SISTER_SITES.map((s, i) => (
            <span key={s.name}>
              {i ? " and " : ""}
              <a href={s.url} target="_blank" rel="noopener noreferrer" className="tap-link font-semibold text-brand-400 hover:underline">
                {s.name}
              </a>
            </span>
          ))}{" "}
          compare their card prices the same way.
        </p>
        <p>
          {SITE_NAME} · Magic: The Gathering card database &amp; price comparison for the US, Australia, the UK, Singapore, Canada and
          the EU. Prices are sourced from public store listings and may be out of date — always confirm on the retailer&apos;s site.
        </p>
        <p className="mt-2">
          Affiliate links: as an eBay Partner Network affiliate and a TCGplayer affiliate, {SITE_NAME} earns from qualifying
          purchases — at no extra cost to you.
        </p>
        <p className="mt-2">{linkFirst(DATA_ATTRIBUTION, "Scryfall", SCRYFALL_URL)}</p>
        <p className="mt-2">{linkFirst(FAN_CONTENT_DISCLAIMER, "Fan Content Policy", FAN_CONTENT_POLICY_URL)}</p>
        <p className="mt-2">{UNOFFICIAL_FAN_SITE_NOTICE}</p>
        <p className="mt-2">&copy; {new Date().getFullYear()} {SITE_NAME}. All rights reserved.</p>
      </div>
    </footer>
  );
}

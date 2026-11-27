"use client";

// Penny, the network's mascot (design agent, owner 2026-11-27: "little mascots, cute little things that are smiling,
// welcoming, inviting … a little mascot saying, hey, search this term here"). Our own flat drawing (no character or
// game art). She sits under the home page's search and suggests a first search: a tap on an example types it into
// the search box and focuses it, so the visitor sees results straight away. Inline, never a pop-up or an overlay
// (one prompt per visit, owner 2026-11-23), server-rendered so nothing shifts, one short wave on load and on hover,
// still under prefers-reduced-motion. Shared file: the same component on every site, only the examples differ.

const CSS = `
.pg{display:flex;align-items:center;gap:12px;width:100%;margin:18px auto 0;max-width:38rem;text-align:left}
@media (min-width:640px){.pg:not(.pg-c){margin-left:0}}
.pg-cat{flex:none;width:72px;height:66px;overflow:visible}
@media (min-width:640px){.pg-cat{width:96px;height:88px}}
.pg-paw{transform-box:view-box;transform-origin:88px 100px}
.pg-wave{opacity:0}
@media (prefers-reduced-motion:no-preference){
.pg-paw{animation:pg-wave 1.1s ease-in-out .5s 2}
.pg-wave{animation:pg-show 1.1s ease-in-out .5s 2}
.pg:hover .pg-paw{animation:pg-wave 1.1s ease-in-out 0s 1}
.pg:hover .pg-wave{animation:pg-show 1.1s ease-in-out 0s 1}
}
@keyframes pg-wave{0%,100%{transform:rotate(0)}25%{transform:rotate(-14deg)}50%{transform:rotate(6deg)}75%{transform:rotate(-10deg)}}
@keyframes pg-show{0%,100%{opacity:0}30%,70%{opacity:.85}}
.pg-say{position:relative;flex:1;min-width:0;padding:10px 12px;border:1px solid rgb(127 127 127 / .28);border-radius:12px;background:rgb(127 127 127 / .07);font-size:14px;line-height:1.4}
.pg-hi{font-weight:650;font-size:15px}
.pg-try{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.pg-ex{font:inherit;font-size:13px;line-height:1;padding:7px 10px;border-radius:8px;border:1px solid rgb(127 127 127 / .35);background:transparent;color:inherit;cursor:pointer}
.pg-ex:hover,.pg-ex:focus-visible{border-color:currentColor}
`;

/** Finds the search box to type into: one marked data-guide-target, else the first visible search field in the hero,
    else the first visible one on the page (a phone's header search). */
function findSearch(): HTMLInputElement | null {
  const visible = (el: Element | null): el is HTMLInputElement => !!el && (el as HTMLElement).offsetParent !== null;
  const marked = document.querySelector("[data-guide-target]");
  if (visible(marked)) return marked;
  const sel = 'input[type="search"], input[type="text"], input:not([type])';
  for (const scope of [".hero-search", "#rc-hero", "#op-hero", ".hero", "main", "header"]) {
    for (const el of Array.from(document.querySelectorAll(`${scope} ${sel}`))) if (visible(el)) return el as HTMLInputElement;
  }
  return null;
}

function typeInto(term: string, fallbackHref?: string, submit = false) {
  const input = findSearch();
  if (!input) {
    if (fallbackHref) window.location.assign(fallbackHref + encodeURIComponent(term));
    return;
  }
  // React keeps its own copy of an input's value: set it through the native setter, then fire input so the search runs.
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, term);
  input.dispatchEvent(new Event("input", { bubbles: true }));
  // A plain GET form (no live suggestions) is sent at once, so the tap lands on results.
  if (submit && input.form) {
    input.form.requestSubmit();
    return;
  }
  input.focus();
  input.scrollIntoView({ block: "center", behavior: "smooth" });
}

export function MascotGuide({
  examples,
  center = false,
  fallbackHref,
  submit = false,
}: {
  examples: string[];
  center?: boolean;
  fallbackHref?: string;
  /** Send the form after typing: for a plain GET search form with no live suggestions. */
  submit?: boolean;
}) {
  return (
    <div className={center ? "pg pg-c" : "pg"} data-mascot-guide="">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <svg className="pg-cat" viewBox="0 0 132 120" aria-hidden="true" focusable="false">
      <path d="M30 118 C30 92 42 82 60 82 C78 82 90 92 90 118 Z" fill="#F2A65A"/>
      <path d="M46 118 C46 100 52 94 60 94 C68 94 74 100 74 118 Z" fill="#FFF4E6"/>
      <g className="pg-paw">
      <path d="M86 100 C98 94 106 84 110 70" stroke="#F2A65A" strokeWidth="12" strokeLinecap="round" fill="none"/>
      <ellipse cx="111" cy="60" rx="10" ry="11" fill="#F2A65A"/>
      <ellipse cx="111" cy="63" rx="4.2" ry="3.6" fill="#F7C6A3"/>
      <circle cx="105.5" cy="56" r="1.9" fill="#F7C6A3"/>
      <circle cx="111" cy="53.5" r="1.9" fill="#F7C6A3"/>
      <circle cx="116.5" cy="56" r="1.9" fill="#F7C6A3"/>
      </g>
      <path className="pg-wave" d="M122 46 Q127 52 124 60 M118 40 Q126 44 128 52" stroke="#F2A65A" strokeWidth="2.4" strokeLinecap="round" fill="none" opacity="0.8"/>
      <path d="M30 30 L36 6 L54 22 Z" fill="#F2A65A"/>
      <path d="M90 30 L84 6 L66 22 Z" fill="#F2A65A"/>
      <path d="M36 25 L38.5 13 L48 21 Z" fill="#F7C6A3"/>
      <path d="M84 25 L81.5 13 L72 21 Z" fill="#F7C6A3"/>
      <ellipse cx="60" cy="50" rx="34" ry="31" fill="#F2A65A"/>
      <path d="M52 21 Q54 27 52 31 M60 19 L60 30 M68 21 Q66 27 68 31" stroke="#D9853B" strokeWidth="3" strokeLinecap="round" fill="none"/>
      <ellipse cx="60" cy="62" rx="17" ry="12.5" fill="#FFF4E6"/>
      <path d="M40 48 Q46 41 52 48" stroke="#1B1C20" strokeWidth="3.4" strokeLinecap="round" fill="none"/>
      <path d="M68 48 Q74 41 80 48" stroke="#1B1C20" strokeWidth="3.4" strokeLinecap="round" fill="none"/>
      <ellipse cx="37" cy="58" rx="5.5" ry="3.5" fill="#F28C8C" opacity="0.7"/>
      <ellipse cx="83" cy="58" rx="5.5" ry="3.5" fill="#F28C8C" opacity="0.7"/>
      <path d="M56.5 56 L63.5 56 L60 60 Z" fill="#E0707A"/>
      <path d="M60 60 Q60 65 54.5 65 M60 60 Q60 65 65.5 65" stroke="#1B1C20" strokeWidth="2.2" strokeLinecap="round" fill="none"/>
      <path d="M55 66 Q60 72 65 66" fill="#E0707A"/>
      <path d="M30 61 L41 62 M31 67 L41 65 M90 61 L79 62 M89 67 L79 65" stroke="#1B1C20" strokeWidth="1.6" strokeLinecap="round" opacity="0.55"/>
      </svg>
      <div className="pg-say">
        <span className="pg-hi">Hi, I&rsquo;m Penny!</span> New here? Search your first item. Try one of these:
        <span className="pg-try">
          {examples.map((t) => (
            <button key={t} type="button" className="pg-ex" onClick={() => typeInto(t, fallbackHref, submit)} data-cta="mascot-example">
              {t}
            </button>
          ))}
        </span>
      </div>
    </div>
  );
}

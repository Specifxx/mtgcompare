// RiftCompare's article and static-page typography, as class strings for a
// container whose children are plain HTML elements. RiftCompare writes these
// classes onto each element (components/Markdown.tsx, app/about/page.tsx); the
// blog and static pages here render ordinary <p>/<h2>/<ul> children, so the
// same values are applied through arbitrary child variants. Replaces the
// baseline's old prose class (wave 2). Literal strings: Tailwind only
// generates the classes it can see verbatim in source.

/** A blog article body: RiftCompare's Markdown.tsx element classes. */
export const ARTICLE_PROSE =
  "text-[15px] sm:text-[17px] [&_p]:my-3 [&_p]:leading-relaxed [&_p]:text-slate-300 sm:[&_p]:max-w-[40rem] " +
  "[&_h2]:mb-3 [&_h2]:mt-8 [&_h2]:scroll-mt-header [&_h2]:text-xl [&_h2]:font-extrabold [&_h2]:text-white sm:[&_h2]:max-w-[40rem] " +
  "[&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:scroll-mt-header [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-white sm:[&_h3]:max-w-[40rem] sm:[&_h3]:text-lg " +
  "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5 [&_ul]:text-slate-300 sm:[&_ul]:max-w-[40rem] " +
  "[&_ol]:my-3 [&_ol]:list-decimal [&_ol]:space-y-1 [&_ol]:pl-5 [&_ol]:text-slate-300 sm:[&_ol]:max-w-[40rem] " +
  "[&_a]:text-brand-400 [&_a]:underline [&_strong]:font-semibold [&_strong]:text-white [&_em]:italic [&_em]:text-slate-200";

/** A static page body (about, privacy, terms…): RiftCompare's app/about/page.tsx. */
export const PAGE_PROSE =
  "text-sm leading-relaxed text-slate-300 [&_p]:my-3 " +
  "[&_h2]:mb-2 [&_h2]:mt-8 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-white " +
  "[&_h3]:mb-2 [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-white " +
  "[&_ul]:my-3 [&_ul]:list-disc [&_ul]:space-y-1.5 [&_ul]:pl-5 " +
  "[&_a]:text-brand-400 hover:[&_a]:underline [&_strong]:text-white";

/**
 * A plain data table in RiftCompare's markup (`w-full text-sm`, an uppercase
 * slate-500 header row over a hairline, hairline rows). Replaces OP's old
 * `.data-table` class; th/td padding comes from the variants so existing
 * table markup keeps its shape.
 */
export const DATA_TABLE =
  "w-full text-sm [&_thead_th]:border-b [&_thead_th]:border-ink-700 [&_thead_th]:px-3 [&_thead_th]:py-2 [&_thead_th]:text-left " +
  "[&_thead_th]:text-xs [&_thead_th]:font-semibold [&_thead_th]:uppercase [&_thead_th]:tracking-wide [&_thead_th]:text-slate-500 " +
  "[&_tbody_tr]:border-b [&_tbody_tr]:border-ink-800 [&_tbody_tr]:transition-colors hover:[&_tbody_tr]:bg-ink-800/40 [&_tbody_td]:px-3 [&_tbody_td]:py-2";

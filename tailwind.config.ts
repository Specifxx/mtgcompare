import type { Config } from "tailwindcss";

// Colours are CSS variables (src/app/globals.css) so light and dark themes
// share one set of class names: bg-surface, text-ink, border-line, …
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        raised: v("raised"),
        line: v("line"),
        ink: v("ink"),
        muted: v("muted"),
        faint: v("faint"),
        brand: { DEFAULT: v("brand"), ink: v("brand-ink"), soft: v("brand-soft"), strong: v("brand-strong") },
        spark: v("spark"),
        open: { DEFAULT: v("open"), soft: v("open-soft") },
        sold: { DEFAULT: v("sold"), soft: v("sold-soft") },
        stale: { DEFAULT: v("stale"), soft: v("stale-soft") },
        pre: { DEFAULT: v("pre"), soft: v("pre-soft") },
        ad: { DEFAULT: v("ad"), line: v("ad-line") },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Helvetica", "Arial", "sans-serif"],
        display: ["var(--font-display)", "var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: { xl: "14px", "2xl": "20px" },
      boxShadow: {
        card: "0 1px 2px rgb(var(--shadow) / 0.06), 0 1px 0 rgb(var(--shadow) / 0.02)",
        lift: "0 10px 30px -12px rgb(var(--shadow) / 0.25), 0 2px 6px rgb(var(--shadow) / 0.06)",
      },
      maxWidth: { page: "1200px", shell: "1480px" },
    },
  },
  plugins: [],
};

export default config;

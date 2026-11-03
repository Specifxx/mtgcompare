import type { Config } from "tailwindcss";

// Colours are CSS variables set from SITE.theme in app/layout.tsx, so the two
// sites share every class name and differ only in src/site.config.ts.
const v = (name: string) => `rgb(var(--c-${name}) / <alpha-value>)`;

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: { 950: v("ink-950"), 900: v("ink-900"), 850: v("ink-850"), 800: v("ink-800"), 700: v("ink-700"), 600: v("ink-600") },
        brand: { DEFAULT: v("brand"), 400: v("brand-light"), 500: v("brand"), 600: v("brand-dark") },
        accent: v("accent"),
        fg: v("fg"),
        muted: v("muted"),
        up: "#3fb950",
        down: "#f0506e",
        buy: { DEFAULT: "#1ea65c", 400: "#34d17e" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "Segoe UI", "Roboto", "Arial", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
      },
      borderRadius: { md: "4px", lg: "6px", xl: "8px", "2xl": "10px" },
    },
  },
  plugins: [],
} satisfies Config;

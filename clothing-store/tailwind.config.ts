import type { Config } from "tailwindcss";

/**
 * ─── THEME PALETTE ───────────────────────────────────────────────
 * The whole site's colours live here. Components only use these
 * role names (bg-canvas, text-ink, bg-primary…), so to re-skin the
 * shop just change the hex values below.
 */
const palette = {
  canvas: "#F3EDE6", // page background
  surface: {
    DEFAULT: "#E4D8CB", // cards, header, chips
    strong: "#D6C5B3", // hover, borders, dividers
  },
  accent: {
    DEFAULT: "#C2A98F", // highlights, badges, focus rings
    strong: "#A88C72", // icons, secondary text on surfaces
  },
  primary: {
    DEFAULT: "#8B6F57", // buttons, CTAs
    hover: "#735B47", // hover / pressed
  },
  ink: {
    DEFAULT: "#4A3A2E", // body + heading text
    deep: "#2F251D", // hero headings, footer background
  },
};

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: { DEFAULT: "1.25rem", md: "2rem" } },
    extend: {
      colors: palette,
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: { xl: "1rem", "2xl": "1.5rem", "3xl": "2rem" },
      boxShadow: {
        soft: "0 2px 10px -2px rgba(74, 58, 46, 0.08), 0 8px 24px -8px rgba(74, 58, 46, 0.10)",
        lift: "0 6px 16px -4px rgba(74, 58, 46, 0.14), 0 18px 40px -12px rgba(74, 58, 46, 0.18)",
      },
      keyframes: {
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
      },
      animation: {
        "fade-up": "fade-up 0.7s cubic-bezier(0.22, 1, 0.36, 1) both",
        "fade-in": "fade-in 0.5s ease-out both",
      },
    },
  },
  plugins: [],
};

export default config;

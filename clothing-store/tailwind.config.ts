import type { Config } from "tailwindcss";
import { palette } from "./theme/palette";

const { shadow, ...colors } = palette;

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    container: { center: true, padding: { DEFAULT: "1.25rem", md: "2rem" } },
    extend: {
      colors,
      fontFamily: {
        serif: ["var(--font-serif)", "Georgia", "serif"],
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      borderRadius: { xl: "1rem", "2xl": "1.5rem", "3xl": "2rem" },
      boxShadow: {
        soft: `0 2px 10px -2px rgba(${shadow}, 0.25), 0 8px 24px -8px rgba(${shadow}, 0.35)`,
        lift: `0 6px 16px -4px rgba(${shadow}, 0.4), 0 18px 40px -12px rgba(${shadow}, 0.5)`,
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

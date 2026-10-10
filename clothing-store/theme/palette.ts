/**
 * ─── THEME PALETTE ───────────────────────────────────────────────
 * The whole site's colours live here. Components only use the role
 * names (bg-canvas, text-ink, bg-primary…), so to re-skin the shop
 * pick a different palette on the last line, or edit the hex values.
 */

/** Black / charcoal with white buttons (current). */
const noir = {
  canvas: "#0A0A0A", // page background
  surface: {
    DEFAULT: "#161616", // cards, hero, chips
    strong: "#262626", // hover, borders, dividers
  },
  accent: {
    DEFAULT: "#737373", // focus rings, subtle highlights
    strong: "#A3A3A3", // small labels, secondary text
  },
  primary: {
    DEFAULT: "#F5F5F5", // buttons, CTAs (white on black)
    hover: "#D4D4D4", // hover / pressed
  },
  ink: {
    DEFAULT: "#D4D4D4", // body text
    deep: "#FAFAFA", // headings
  },
  shadow: "0, 0, 0", // RGB used for soft shadows
};

/** Warm mocha / sand (the original proposal). */
const mocha = {
  canvas: "#F3EDE6",
  surface: { DEFAULT: "#E4D8CB", strong: "#D6C5B3" },
  accent: { DEFAULT: "#C2A98F", strong: "#A88C72" },
  primary: { DEFAULT: "#8B6F57", hover: "#735B47" },
  ink: { DEFAULT: "#4A3A2E", deep: "#2F251D" },
  shadow: "74, 58, 46",
};

export const palettes = { noir, mocha };
export const palette = palettes.noir;

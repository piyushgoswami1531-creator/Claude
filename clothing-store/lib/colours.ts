/**
 * Swatch colours for colour names. Unknown names show a neutral swatch
 * with the name, so the owner can type any colour.
 */
const SWATCHES: Record<string, string> = {
  black: "#111111", white: "#F7F7F5", grey: "#9CA3AF", gray: "#9CA3AF", charcoal: "#36393D",
  navy: "#1E2A44", blue: "#2F5D9E", "sky blue": "#8DB8E0", "light blue": "#A9C6E3", "mid blue": "#4C6F9C",
  indigo: "#2C3A64", beige: "#D8C7A9", sand: "#CDB894", cream: "#EFE6D2", natural: "#E6DCC6",
  khaki: "#B3A47A", camel: "#B9895A", tan: "#C39A6B", brown: "#6B4A33", mocha: "#7B5E48",
  olive: "#6B6B3A", green: "#3F7A4A", maroon: "#6E1F2A", red: "#B3261E", mustard: "#D2A332",
  gold: "#C9A443", yellow: "#E8C547", pink: "#E7A1B0", purple: "#6D4C8C", orange: "#D9772B",
};

export const swatchFor = (name: string) => SWATCHES[name.trim().toLowerCase()] ?? null;

/** Quick-pick colours in the admin form. Any other colour can be typed in. */
export const COMMON_COLOURS = [
  "Black", "White", "Grey", "Charcoal", "Navy", "Blue", "Light Blue", "Beige", "Cream",
  "Brown", "Tan", "Khaki", "Olive", "Green", "Maroon", "Red", "Pink", "Mustard", "Yellow",
];

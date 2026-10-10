/**
 * Generates tonal placeholder images (SVG) for every dummy product,
 * category card, the hero banner and the about strip.
 *
 *   npm run placeholders
 *
 * Output: public/placeholders/*.svg  (safe to delete once real photos exist)
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { seedCategories, seedProducts, IMAGES_PER_PRODUCT } from "../lib/data/seedData.ts";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "placeholders");
mkdirSync(outDir, { recursive: true });

// Same family as tailwind.config.ts — placeholders stay on-palette.
const BACKGROUNDS = [
  ["#EDE3D8", "#DCCBB9"],
  ["#E4D8CB", "#D2BFAB"],
  ["#F0E8DF", "#E0D0BF"],
  ["#E8DDD1", "#CDB8A2"],
];
const FILLS = ["#8B6F57", "#735B47", "#A88C72", "#5E4A3A", "#9C7E63", "#4A3A2E", "#B39880"];

// ─── Garment silhouettes (800 × 1000 canvas) ───
const shapes = {
  tee: (f, d) => `
    <path fill="${f}" d="M285 250 L345 215 Q400 262 455 215 L515 250 L640 345 L585 430 L535 395 L535 790 L265 790 L265 395 L215 430 L160 345 Z"/>
    <path fill="none" stroke="${d}" stroke-width="6" stroke-linecap="round" d="M345 215 Q400 285 455 215"/>`,
  shirt: (f, d) => `
    <path fill="${f}" d="M310 225 L365 205 L400 250 L435 205 L490 225 L600 285 L665 650 L605 668 L555 400 L555 800 L245 800 L245 400 L195 668 L135 650 L200 285 Z"/>
    <path fill="none" stroke="${d}" stroke-width="6" stroke-linejoin="round" d="M365 205 L345 270 L400 250 L455 270 L435 205"/>
    <path stroke="${d}" stroke-width="5" d="M400 250 L400 800"/>
    ${[320, 400, 480, 560, 640, 720].map((y) => `<circle cx="415" cy="${y}" r="7" fill="${d}"/>`).join("")}
    <rect x="455" y="330" width="60" height="70" rx="6" fill="none" stroke="${d}" stroke-width="5"/>`,
  sweater: (f, d) => `
    <path fill="${f}" d="M305 230 L350 210 Q400 245 450 210 L495 230 L600 290 L660 660 L600 675 L550 410 L550 790 L250 790 L250 410 L200 675 L140 660 L200 290 Z"/>
    <path fill="none" stroke="${d}" stroke-width="7" d="M350 210 Q400 262 450 210"/>
    ${[750, 765].map((y) => `<path stroke="${d}" stroke-width="4" d="M250 ${y} L550 ${y}"/>`).join("")}
    <path stroke="${d}" stroke-width="4" d="M148 630 L203 643 M597 643 L652 630"/>`,
  hoodie: (f, d) => `
    <path fill="${f}" d="M300 250 Q300 140 400 140 Q500 140 500 250 L600 295 L660 660 L600 675 L550 410 L550 790 L250 790 L250 410 L200 675 L140 660 L200 295 Z"/>
    <path fill="none" stroke="${d}" stroke-width="6" d="M335 255 Q335 175 400 175 Q465 175 465 255 Q400 300 335 255 Z"/>
    <path stroke="${d}" stroke-width="5" stroke-linecap="round" d="M380 290 L375 370 M420 290 L425 370"/>
    <path fill="none" stroke="${d}" stroke-width="6" d="M300 560 L500 560 L530 690 L270 690 Z"/>`,
  jacket: (f, d) => `
    <path fill="${f}" d="M300 225 L360 200 L400 240 L440 200 L500 225 L605 290 L665 665 L605 680 L555 410 L560 800 L240 800 L245 410 L195 680 L135 665 L195 290 Z"/>
    <path fill="none" stroke="${d}" stroke-width="6" stroke-linejoin="round" d="M360 200 L330 300 L395 360 M440 200 L470 300 L405 360"/>
    <path stroke="${d}" stroke-width="6" d="M400 360 L400 800"/>
    <path fill="none" stroke="${d}" stroke-width="5" d="M290 520 L360 520 M440 520 L510 520"/>`,
  vest: (f, d) => `
    <path fill="${f}" d="M310 215 L365 200 L400 280 L435 200 L490 215 Q540 250 560 330 L555 800 L245 800 L240 330 Q260 250 310 215 Z"/>
    <path fill="none" stroke="${d}" stroke-width="6" d="M365 200 L400 280 L435 200"/>
    <path stroke="${d}" stroke-width="5" d="M400 280 L400 800"/>
    ${[350, 440, 530, 620, 710].map((y) => `<circle cx="415" cy="${y}" r="8" fill="${d}"/>`).join("")}
    <path stroke="${d}" stroke-width="5" d="M290 470 L350 470"/>`,
  kurta: (f, d) => `
    <path fill="${f}" d="M320 195 L370 185 L400 220 L430 185 L480 195 L580 255 L640 540 L590 555 L545 360 L585 870 L215 870 L255 360 L210 555 L160 540 L220 255 Z"/>
    <path fill="none" stroke="${d}" stroke-width="6" d="M370 185 L370 200 Q400 215 430 200 L430 185"/>
    <path stroke="${d}" stroke-width="5" d="M400 220 L400 430"/>
    ${[260, 320, 380].map((y) => `<circle cx="400" cy="${y}" r="6" fill="${d}"/>`).join("")}
    <path fill="none" stroke="${d}" stroke-width="4" d="M228 820 L572 820"/>`,
  jeans: (f, d) => `
    <path fill="${f}" d="M285 190 L515 190 L548 810 L428 810 L400 390 L372 810 L252 810 Z"/>
    <path stroke="${d}" stroke-width="6" d="M287 235 L513 235"/>
    <path fill="none" stroke="${d}" stroke-width="5" d="M300 240 Q320 300 375 300 M500 240 Q480 300 425 300"/>
    <path stroke="${d}" stroke-width="5" d="M400 235 L400 390"/>
    <circle cx="400" cy="215" r="7" fill="${d}"/>`,
  trousers: (f, d) => `
    <path fill="${f}" d="M290 190 L510 190 L535 810 L425 810 L400 380 L375 810 L265 810 Z"/>
    <path stroke="${d}" stroke-width="7" d="M291 230 L509 230"/>
    <path stroke="${d}" stroke-width="3" stroke-dasharray="2 0" d="M330 260 L320 800 M470 260 L480 800"/>
    <path fill="none" stroke="${d}" stroke-width="5" d="M300 245 L330 320 M500 245 L470 320"/>`,
  belt: (f, d) => `
    <path fill="none" stroke="${f}" stroke-width="70" stroke-linecap="round" d="M220 600 Q220 360 400 360 Q600 360 600 520 Q600 650 470 650"/>
    <rect x="160" y="560" width="120" height="120" rx="14" fill="none" stroke="${d}" stroke-width="14"/>
    <path stroke="${d}" stroke-width="10" d="M220 570 L220 670"/>
    ${[400, 450, 500].map((x) => `<circle cx="${x}" cy="360" r="8" fill="${d}"/>`).join("")}`,
  bag: (f, d) => `
    <path fill="none" stroke="${d}" stroke-width="22" stroke-linecap="round" d="M310 400 Q310 230 400 230 Q490 230 490 400"/>
    <path fill="${f}" d="M220 380 L580 380 L620 820 Q620 840 600 840 L200 840 Q180 840 180 820 Z"/>
    <rect x="320" y="520" width="160" height="130" rx="10" fill="none" stroke="${d}" stroke-width="5"/>`,
  cap: (f, d) => `
    <path fill="${f}" d="M200 560 Q200 330 400 330 Q600 330 600 560 Z"/>
    <path fill="${d}" d="M560 545 Q700 545 720 600 Q640 620 540 595 Z"/>
    <path fill="none" stroke="${d}" stroke-width="5" d="M400 330 L400 560 M300 350 Q330 450 330 560 M500 350 Q470 450 470 560"/>
    <circle cx="400" cy="328" r="14" fill="${d}"/>`,
};

const detailFor = (fill) => (["#4A3A2E", "#5E4A3A", "#735B47"].includes(fill) ? "#C2A98F" : "#4A3A2E");

function svg({ w = 800, h = 1000, bg, body }) {
  const [a, b] = bg;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.4" r="0.6"><stop offset="0" stop-color="#F7F2EC" stop-opacity="0.8"/><stop offset="1" stop-color="#F7F2EC" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="url(#bg)"/>
  <rect width="${w}" height="${h}" fill="url(#glow)"/>
  ${body}
</svg>`;
}

function garment(shape, fill, { scale = 1, dx = 0, dy = 0 } = {}) {
  const d = detailFor(fill);
  const t = `translate(${dx} ${dy}) translate(400 500) scale(${scale}) translate(-400 -500)`;
  return `<ellipse cx="${400 + dx}" cy="${880 + dy}" rx="${220 * scale}" ry="${22 * scale}" fill="#4A3A2E" opacity="0.10"/>
  <g transform="${t}">${shapes[shape](fill, d)}</g>`;
}

const write = (name, content) => writeFileSync(join(outDir, name), content);
let count = 0;

// Products: 3 views each (front, zoomed, alt colour)
seedProducts.forEach((p, i) => {
  for (let n = 0; n < IMAGES_PER_PRODUCT; n++) {
    const bg = BACKGROUNDS[(i + n) % BACKGROUNDS.length];
    const fill = FILLS[(i * 2 + n * 3) % FILLS.length];
    const opts = n === 1 ? { scale: 1.35, dy: 60 } : { scale: 0.9 };
    write(`${p.slug}-${n + 1}.svg`, svg({ bg, body: garment(p.shape, fill, opts) }));
    count++;
  }
});

// Category cards
seedCategories.filter((c) => !c.parent).forEach((c, i) => {
  const bg = BACKGROUNDS[i % BACKGROUNDS.length];
  write(`category-${c.slug}.svg`, svg({ bg, body: garment(c.shape, FILLS[i % FILLS.length], { scale: 0.85 }) }));
  count++;
});

// Hero: three overlapping garments
write("hero.svg", svg({
  w: 1000, h: 1200, bg: ["#E4D8CB", "#C9B39C"],
  body: `<g transform="translate(100 100)">
    ${garment("jacket", "#735B47", { scale: 0.8, dx: -150, dy: 40 })}
    ${garment("hoodie", "#A88C72", { scale: 0.8, dx: 160, dy: 80 })}
    ${garment("shirt", "#8B6F57", { scale: 0.95, dx: 0, dy: 0 })}
  </g>`,
}));
count++;

// About strip: clothes rail
const rail = ["shirt", "sweater", "kurta", "jacket", "tee"]
  .map((s, i) => {
    const x = 140 + i * 180;
    return `<path fill="none" stroke="#4A3A2E" stroke-width="5" d="M${x} 210 Q${x} 185 ${x + 15} 185 Q${x + 30} 185 ${x + 30} 200 L${x} 240"/>
      <g transform="translate(${x - 400 * 0.42} ${235 - 190 * 0.42}) scale(0.42)">${shapes[s](FILLS[i + 1], detailFor(FILLS[i + 1]))}</g>`;
  })
  .join("");
write("about.svg", svg({
  w: 1000, h: 750, bg: ["#E8DDD1", "#D2BFAB"],
  body: `<path stroke="#4A3A2E" stroke-width="10" stroke-linecap="round" d="M80 185 L920 185"/>${rail}
    <rect x="0" y="690" width="1000" height="60" fill="#4A3A2E" opacity="0.08"/>`,
}));
count++;

console.log(`Generated ${count} placeholder images in public/placeholders/`);

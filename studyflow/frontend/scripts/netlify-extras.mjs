// Adds Netlify's config files to dist-netlify/ after `vite build --mode standalone`.
import { writeFileSync } from "node:fs";

const out = (name, text) => writeFileSync(new URL(`../dist-netlify/${name}`, import.meta.url), text);

// Single-page app: every path (/today, /calendar, ...) serves index.html.
out("_redirects", "/*    /index.html    200\n");

// The app shell must revalidate so updates reach installed copies; hashed assets cache forever.
out("_headers", `/index.html
  Cache-Control: no-cache
/sw.js
  Cache-Control: no-cache
/registerSW.js
  Cache-Control: no-cache
/manifest.webmanifest
  Cache-Control: no-cache
  Content-Type: application/manifest+json
/assets/*
  Cache-Control: public, max-age=31536000, immutable
/*
  X-Content-Type-Options: nosniff
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
`);
console.log("dist-netlify/ ready: drag this folder onto https://app.netlify.com/drop");

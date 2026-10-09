// Turns dist-artifact/artifact.html (a full document) into the body-only page a
// claude.ai Artifact expects: <title>, font links, <style>, the app root, <script>.
// The Artifact platform adds its own doctype/head/viewport around it.
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync(new URL("../dist-artifact/artifact.html", import.meta.url), "utf8");
const pick = (re) => [...src.matchAll(re)].map((m) => m[0]);

const title = pick(/<title>[\s\S]*?<\/title>/g);
const links = pick(/<link\b[^>]*>/g).filter((l) => l.includes("fonts.g"));
const styles = pick(/<style\b[^>]*>[\s\S]*?<\/style>/g);
const scripts = pick(/<script\b[^>]*>[\s\S]*?<\/script>/g);
if (title.length !== 1 || !styles.length || scripts.length !== 1) {
  throw new Error(`unexpected build output: ${title.length} title, ${styles.length} style, ${scripts.length} script`);
}
// An inline script must not contain "</script" anywhere except its own closing tag.
const body = scripts[0].replace(/^<script\b[^>]*>/, "").replace(/<\/script>$/, "");
if (/<\/script/i.test(body)) throw new Error("inline script contains </script>; cannot inline safely");

const out = [...title, ...links, ...styles, '<div id="root"></div>', scripts[0]].join("\n");
writeFileSync(new URL("../dist-artifact/studyflow.html", import.meta.url), out);
console.log(`dist-artifact/studyflow.html  ${(out.length / 1024).toFixed(0)} KB`);

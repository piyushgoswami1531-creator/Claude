/**
 * Which build this is:
 *  - "web":        talks to the FastAPI server (Render/Railway/Docker)
 *  - "artifact":   runs inside a claude.ai Artifact page (phone version)
 *  - "standalone": static site, everything in the browser (Netlify / offline)
 */
const TARGET = (import.meta.env.VITE_TARGET as string | undefined) ?? "web";

export const IS_ARTIFACT = TARGET === "artifact";
export const IS_STANDALONE = TARGET === "standalone";
/** No server: the planner runs in the page and data lives with the viewer. */
export const IS_LOCAL = IS_ARTIFACT || IS_STANDALONE;

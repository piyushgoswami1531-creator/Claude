/** Standalone (Netlify) build: the viewer's own settings, kept in this browser only. */
export interface Settings { name: string; apiKey: string; model: string }

export const MODELS = [
  { id: "claude-opus-5-5", label: "Claude Opus 5.5", note: "Best quality (default)" },
  { id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5", note: "About half the cost" },
  { id: "claude-haiku-5-5", label: "Claude Haiku 5.5", note: "Cheapest, fastest" },
] as const;

const KEY = "studyflow-settings";
const DEFAULTS: Settings = { name: "", apiKey: "", model: MODELS[0].id };

export function getSettings(): Settings {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify({ name: s.name.trim().slice(0, 60), apiKey: s.apiKey.trim(), model: s.model }));
  } catch {
    throw new Error("This browser is blocking storage, so settings can't be saved.");
  }
}

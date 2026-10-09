/**
 * How the in-page backend reaches Claude. Two engines, one shape:
 *  - "sample":    the claude.ai Artifact runtime (phone version) — the viewer's own Claude account
 *  - "anthropic": the official Anthropic SDK with the viewer's own API key (standalone/Netlify)
 * Both throw EngineError with a stable `code`; ai.ts turns codes into user-facing messages.
 */
import { IS_ARTIFACT, IS_STANDALONE } from "../lib/env";
import { getSettings } from "./settings";
import { claudeUse } from "./store";

export interface AskOpts {
  /** JSON schema to enforce (Anthropic structured outputs). Ignored when webSearch is on. */
  schema?: Record<string, unknown>;
  webSearch?: boolean;
  pdfBase64?: string;
  effort?: "low" | "medium" | "high";
}
export interface AskResult {
  /** Parsed JSON when the engine already parsed it. */
  raw?: unknown;
  /** The final answer text. */
  text: string;
  sources: { url: string; title: string }[];
}
export interface Engine {
  kind: "sample" | "anthropic";
  canSearch: boolean;
  canReadPdf: boolean;
  ask(prompt: string, opts?: AskOpts): Promise<AskResult>;
}

export class EngineError extends Error {
  constructor(public code: string, message = code) {
    super(message);
  }
}

// ------------------------------------------------------------- sample (Artifact)
type Sample = { json<T = unknown>(input: string, opts?: Record<string, unknown>): Promise<T> };

let sampleP: Promise<Sample | null> | null = null;
function sampleEngine(): Promise<Engine | null> {
  sampleP ??= claudeUse<Sample>("sample");
  return sampleP.then((s) =>
    s
      ? {
          kind: "sample",
          canSearch: false,
          canReadPdf: false,
          async ask(prompt) {
            try {
              const raw = await s.json(prompt, { modelTier: "default", cache: false });
              return { raw, text: JSON.stringify(raw), sources: [] };
            } catch (e) {
              const err = e as { code?: string; text?: string };
              throw new EngineError(err.code ?? "upstream_error", err.text ?? "");
            }
          },
        }
      : null,
  );
}

// ------------------------------------------------ Anthropic SDK (standalone build)
const FALLBACK_MODELS = new Set(["claude-opus-5-5", "claude-sonnet-5-5"]);

async function anthropicEngine(): Promise<Engine | null> {
  const { apiKey, model } = getSettings();
  if (!apiKey) return null;
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  // The key is the viewer's own, typed into this browser, and only ever sent to Anthropic.
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2, timeout: 300_000 });
  const webSearchType = model.startsWith("claude-haiku") ? "web_search_20250305" : "web_search_20260209";

  return {
    kind: "anthropic",
    canSearch: true,
    canReadPdf: true,
    async ask(prompt, opts = {}) {
      const userContent = opts.pdfBase64
        ? [
            { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data: opts.pdfBase64 } },
            { type: "text" as const, text: prompt },
          ]
        : prompt;
      const first = { role: "user" as const, content: userContent };
      const useSchema = opts.schema && !opts.webSearch;
      const base = {
        model,
        max_tokens: 16000,
        output_config: {
          effort: opts.effort ?? "medium",
          ...(useSchema ? { format: { type: "json_schema" as const, schema: opts.schema! } } : {}),
        },
        ...(opts.webSearch ? { tools: [{ type: webSearchType, name: "web_search" as const, max_uses: 4 }] } : {}),
        ...(FALLBACK_MODELS.has(model) ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
      };

      let resp;
      try {
        let messages: unknown[] = [first];
        for (let i = 0; i < 4; i++) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          resp = await client.beta.messages.create({ ...base, messages } as any);
          if (resp.stop_reason !== "pause_turn") break;
          messages = [first, { role: "assistant", content: resp.content }]; // resume a paused server-tool turn
        }
      } catch (e) {
        if (e instanceof Anthropic.AuthenticationError) throw new EngineError("bad_key");
        if (e instanceof Anthropic.PermissionDeniedError) throw new EngineError("no_access");
        if (e instanceof Anthropic.NotFoundError) throw new EngineError("bad_model");
        if (e instanceof Anthropic.RateLimitError) throw new EngineError("rate_limited");
        if (e instanceof Anthropic.BadRequestError) throw new EngineError("bad_request", e.message);
        if (e instanceof Anthropic.APIConnectionError) throw new EngineError("offline");
        if (e instanceof Anthropic.APIError) throw new EngineError("upstream_error", e.message);
        throw new EngineError("upstream_error", String(e));
      }
      if (!resp) throw new EngineError("upstream_error");
      if (resp.stop_reason === "refusal") throw new EngineError("refused");
      if (resp.stop_reason === "max_tokens") throw new EngineError("too_long");

      // The answer is the text written after the last tool result.
      const blocks = resp.content as { type: string; text?: string; content?: unknown }[];
      let lastTool = -1;
      blocks.forEach((b, i) => b.type.endsWith("_tool_result") && (lastTool = i));
      const text = blocks.slice(lastTool + 1).filter((b) => b.type === "text").map((b) => b.text ?? "").join("").trim();

      const sources: AskResult["sources"] = [];
      for (const b of blocks) {
        if (b.type !== "web_search_tool_result" || !Array.isArray(b.content)) continue; // error results are objects
        for (const r of b.content as { url?: string; title?: string }[]) {
          if (r.url && !sources.some((s) => s.url === r.url)) sources.push({ url: r.url, title: r.title || r.url });
        }
      }
      return { text, sources: sources.slice(0, 8) };
    },
  };
}

/** The engine for this build, or null (offline demo mode). Re-read on every call so a new key applies at once. */
export async function getEngine(): Promise<Engine | null> {
  if (IS_ARTIFACT) return sampleEngine();
  if (IS_STANDALONE) return anthropicEngine();
  return null;
}

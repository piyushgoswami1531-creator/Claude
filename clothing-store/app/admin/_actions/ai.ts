"use server";

import Anthropic from "@anthropic-ai/sdk";
import { requireAdmin } from "@/lib/admin";
import type { ActionResult } from "@/lib/adminTypes";
import { COMMON_COLOURS } from "@/lib/colours";
import { siteConfig } from "@/lib/siteConfig";
import { isValidPhotoPath, publicPhotoUrl } from "@/lib/storage";

export type Suggestion = {
  name: string;
  description: string;
  category_id: string | null;
  colours: string[];
};

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5-5";

const SYSTEM = `You write product listings for ${siteConfig.name}, a local clothing store in India. Customers browse on their phones and order on WhatsApp.

From the product photo, suggest:
- name: a short, plain product name a shopper would search for, 2-5 words, Title Case (e.g. "Checked Cotton Shirt", "Slim Fit Blue Jeans"). No brand names, no sizes, no prices.
- description: 1-2 short, friendly sentences about the look, fit and when to wear it, in simple English. Only mention the fabric if it is clearly visible (e.g. denim, knit); never invent brands, fabric percentages, or care instructions.
- category_id: the one category from the list that fits best.
- colours: the main colour or colours of the garment itself (not the background), 1-3 simple colour names. Prefer these names when they fit: ${COMMON_COLOURS.join(", ")}.

If the photo does not show clothing or an accessory, still return your best guess and keep the description neutral.`;

/** Suggest name, description, category and colours from the product's cover photo. */
export async function suggestProductDetails(
  storagePath: string,
  categories: { id: string; label: string }[],
): Promise<ActionResult<Suggestion>> {
  await requireAdmin();
  if (!process.env.ANTHROPIC_API_KEY) return { ok: false, message: "AI suggestions aren't set up yet." };
  if (!isValidPhotoPath(storagePath) || categories.length === 0) return { ok: false, message: "Couldn't read the photo." };

  // Send the image bytes ourselves so it works whatever the storage URL looks like.
  const img = await fetch(publicPhotoUrl(storagePath));
  if (!img.ok) return { ok: false, message: "Couldn't read the photo." };
  const data = Buffer.from(await img.arrayBuffer()).toString("base64");

  const ids = categories.map((c) => c.id);
  const client = new Anthropic({ maxRetries: 1, timeout: 45_000 });

  try {
    const response = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system: SYSTEM,
      // A quick labelling task: low effort keeps it fast and cheap.
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: {
            type: "object",
            properties: {
              name: { type: "string" },
              description: { type: "string" },
              category_id: { type: "string", enum: ids },
              colours: { type: "array", items: { type: "string" } },
            },
            required: ["name", "description", "category_id", "colours"],
            additionalProperties: false,
          },
        },
      },
      // If a safety check declines, let the API retry on its recommended model.
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/webp", data } },
            { type: "text", text: `Categories (id: name):\n${categories.map((c) => `${c.id}: ${c.label}`).join("\n")}` },
          ],
        },
      ],
    });

    if (response.stop_reason === "refusal" || response.stop_reason === "max_tokens") {
      return { ok: false, message: "Couldn't suggest details for this photo. Please fill them in." };
    }
    const text = response.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") return { ok: false, message: "Couldn't suggest details. Please fill them in." };

    const raw = JSON.parse(text.text) as Partial<Suggestion>;
    const colours = [...new Set((raw.colours ?? []).map((c) => String(c).trim()).filter(Boolean))]
      .map((c) => c.charAt(0).toUpperCase() + c.slice(1))
      .slice(0, 3);

    return {
      ok: true,
      data: {
        name: String(raw.name ?? "").trim().slice(0, 80),
        description: String(raw.description ?? "").trim().slice(0, 500),
        category_id: raw.category_id && ids.includes(raw.category_id) ? raw.category_id : null,
        colours,
      },
    };
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      return { ok: false, message: "AI is busy right now. Please fill in the details or try again in a minute." };
    }
    if (error instanceof Anthropic.APIError) {
      console.error(`AI suggestion failed (${error.status}):`, error.message);
    } else {
      console.error("AI suggestion failed:", error);
    }
    return { ok: false, message: "Couldn't suggest details. Please fill them in." };
  }
}

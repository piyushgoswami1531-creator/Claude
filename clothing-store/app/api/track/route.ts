import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createServiceClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const short = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim().slice(0, 40) : null);

/**
 * Records one "Order on WhatsApp" tap. Called with navigator.sendBeacon, so it
 * always answers 204 and never blocks the customer. Writes use the service key
 * because the clicks table has no public insert policy.
 */
export async function POST(request: Request) {
  if (!isSupabaseConfigured || !process.env.SUPABASE_SERVICE_ROLE_KEY) return new Response(null, { status: 204 });

  let body: { product_id?: unknown; size?: unknown; colour?: unknown };
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 204 });
  }
  const productId = typeof body.product_id === "string" ? body.product_id : "";
  if (!UUID.test(productId)) return new Response(null, { status: 204 });

  // The foreign key rejects unknown products, so junk ids are simply not stored.
  const { error } = await createServiceClient()
    .from("clicks")
    .insert({ product_id: productId, size: short(body.size), colour: short(body.colour) });
  if (error && error.code !== "23503") console.error("Click tracking failed:", error.message);

  return new Response(null, { status: 204 });
}

/** Fire-and-forget: count a WhatsApp order tap without delaying WhatsApp opening. */
export function trackOrderClick(productId: string, size: string | null, colour: string | null) {
  const body = JSON.stringify({ product_id: productId, size, colour });
  try {
    if (navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }))) return;
  } catch {}
  fetch("/api/track", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true }).catch(() => undefined);
}

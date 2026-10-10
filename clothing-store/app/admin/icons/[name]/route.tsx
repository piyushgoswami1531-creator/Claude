import { ImageResponse } from "next/og";
import { siteConfig } from "@/lib/siteConfig";
import { palette } from "@/theme/palette";

/** App icons drawn from the shop name, so they update when the name is set. */
const SIZES: Record<string, { size: number; padding: number }> = {
  "icon-192.png": { size: 192, padding: 0 },
  "icon-512.png": { size: 512, padding: 0 },
  "maskable-512.png": { size: 512, padding: 0.12 }, // keeps the letter inside Android's safe zone
  "apple-touch-icon.png": { size: 180, padding: 0 },
};

export function generateStaticParams() {
  return Object.keys(SIZES).map((name) => ({ name }));
}

export function GET(_req: Request, { params }: { params: { name: string } }) {
  const spec = SIZES[params.name];
  if (!spec) return new Response("Not found", { status: 404 });
  const { size, padding } = spec;
  const letter = siteConfig.name.replace(/[^A-Za-z0-9]/g, "").charAt(0).toUpperCase() || "S";
  const inner = size * (1 - padding * 2);

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: palette.canvas }}>
        <div
          style={{
            width: inner * 0.78,
            height: inner * 0.78,
            borderRadius: "50%",
            border: `${Math.max(2, size / 64)}px solid ${palette.primary.DEFAULT}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: palette.primary.DEFAULT,
            fontSize: inner * 0.46,
            fontWeight: 700,
          }}
        >
          {letter}
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}

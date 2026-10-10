import { siteConfig } from "@/lib/siteConfig";
import { palette } from "@/theme/palette";

/** Lets the owner add the shop manager to his phone's home screen as an app. */
export function GET() {
  const manifest = {
    name: `${siteConfig.name} Manager`,
    short_name: `${siteConfig.shortName} Manager`,
    description: "Add and manage products in your shop",
    id: "/admin",
    start_url: "/admin",
    scope: "/admin",
    display: "standalone",
    orientation: "portrait",
    background_color: palette.canvas,
    theme_color: palette.canvas,
    icons: [
      { src: "/admin/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/admin/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/admin/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: { "Content-Type": "application/manifest+json", "Cache-Control": "public, max-age=3600" },
  });
}

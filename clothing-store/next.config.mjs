/** @type {import('next').NextConfig} */

// Product photos are served from Supabase Storage.
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL) : null;

const nextConfig = {
  images: {
    formats: ["image/avif", "image/webp"],
    // Seed placeholder images are local SVGs; real photos are WebP.
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [
      ...(supabase
        ? [{ protocol: supabase.protocol.replace(":", ""), hostname: supabase.hostname, port: supabase.port, pathname: "/storage/v1/object/public/**" }]
        : []),
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
  },
  async headers() {
    return [
      // Lets the admin service worker (in /admin/) control the /admin start page.
      { source: "/admin/sw.js", headers: [{ key: "Service-Worker-Allowed", value: "/admin" }, { key: "Cache-Control", value: "no-cache" }] },
    ];
  },
};

export default nextConfig;

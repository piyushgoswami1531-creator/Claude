/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    // Placeholder product images are local SVGs. Real photos will come from
    // Supabase Storage (added to remotePatterns in step b).
    dangerouslyAllowSVG: true,
    contentDispositionType: "attachment",
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
    remotePatterns: [],
  },
};

export default nextConfig;

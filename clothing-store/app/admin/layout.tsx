import type { Metadata, Viewport } from "next";
import InstallHelper from "@/components/admin/InstallHelper";
import { ToastProvider } from "@/components/admin/Toast";
import { siteConfig } from "@/lib/siteConfig";

export const metadata: Metadata = {
  title: { default: "Shop Manager", template: `%s | ${siteConfig.shortName} Manager` },
  robots: { index: false, follow: false },
  manifest: "/admin/manifest.webmanifest",
  appleWebApp: { capable: true, title: `${siteConfig.shortName} Manager`, statusBarStyle: "black-translucent" },
  icons: { apple: "/admin/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover" };

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <ToastProvider>
      <InstallHelper />
      {children}
    </ToastProvider>
  );
}

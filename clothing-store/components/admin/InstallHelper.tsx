"use client";

import { useEffect } from "react";

/** Registers the admin service worker so the app can be installed on the phone. */
export default function InstallHelper() {
  useEffect(() => {
    if ("serviceWorker" in navigator && process.env.NODE_ENV === "production") {
      navigator.serviceWorker.register("/admin/sw.js", { scope: "/admin" }).catch(() => undefined);
    }
  }, []);
  return null;
}

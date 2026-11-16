"use client";

import { useEffect } from "react";
// Side effect: starts listening for `beforeinstallprompt` as early as possible
// (this component is mounted in the root layout on every page).
import "@/lib/pwa-install";

/**
 * Registers public/sw.js (docs/plans/plan-pwa.md, PWA-04).
 *
 * Kill switch: NEXT_PUBLIC_PWA=off unregisters any installed worker instead,
 * so a bad SW can be removed from every device by one env change + restart.
 * Renders nothing.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    // Service workers only run in secure contexts (https or localhost).
    if (!window.isSecureContext) return;

    if (process.env.NEXT_PUBLIC_PWA === "off") {
      void navigator.serviceWorker
        .getRegistrations()
        .then((regs) => Promise.all(regs.map((r) => r.unregister())));
      return;
    }

    // P3: production builds have content-hashed /_next/static files, safe to
    // cache-first; under `next dev` they are not, so the SW must leave them alone.
    const script = process.env.NODE_ENV === "production" ? "/sw.js?static=1" : "/sw.js";
    navigator.serviceWorker
      .register(script, { scope: "/", updateViaCache: "none" })
      .catch((err: unknown) => {
        console.warn("[pwa] service worker registration failed", err);
      });
  }, []);

  return null;
}

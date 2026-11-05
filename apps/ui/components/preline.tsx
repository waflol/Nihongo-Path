"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/**
 * Initializes Preline UI interactive components (dropdown, off-canvas, modal,
 * tabs, tooltip, ...) after hydration and after every App Router route change.
 *
 * Integration notes (verified against preline@5.0.0 dist):
 * - The preline module is imported DYNAMICALLY inside useEffect so its
 *   module-level browser wiring (window listeners, collections) never runs
 *   during Server Components/SSR — preline v5's full bundle references
 *   `window` at module scope, so a top-level import crashes Next prerender.
 * - HSStaticMethods.autoInit() is idempotent: each plugin's autoInit() filters
 *   its global collection so elements already initialized are not
 *   re-instantiated (no duplicated event listeners). This is the safe way to
 *   re-run init after App Router route changes (spec §18.2 risk).
 */
export function Preline() {
  const pathname = usePathname();

  useEffect(() => {
    let cancelled = false;
    void import("preline").then(({ HSStaticMethods }) => {
      if (!cancelled) HSStaticMethods.autoInit("all");
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return null;
}

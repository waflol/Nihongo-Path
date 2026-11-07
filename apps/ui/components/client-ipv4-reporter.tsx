"use client";

import { useEffect } from "react";

const COOKIE = "client_ipv4";
const IPV4_RE = /^(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)$/;

/**
 * Looks up this browser's public IPv4 (api.ipify.org has no IPv6 record, so
 * the lookup always goes out over IPv4) and stores it in a cookie. The server
 * forwards it to the API as `X-Client-Ipv4`, where it is logged for display
 * only — it is self-declared, so it is never used for blocking or limits.
 */
export function ClientIpv4Reporter() {
  useEffect(() => {
    if (document.cookie.split("; ").some((c) => c.startsWith(`${COOKIE}=`))) return;
    const ctrl = new AbortController();
    fetch("https://api.ipify.org?format=text", { signal: ctrl.signal, cache: "no-store" })
      .then((r) => (r.ok ? r.text() : ""))
      .then((t) => {
        const ip = t.trim();
        if (IPV4_RE.test(ip)) {
          document.cookie = `${COOKIE}=${ip}; Path=/; Max-Age=3600; SameSite=Lax`;
        }
      })
      .catch(() => undefined);
    return () => ctrl.abort();
  }, []);
  return null;
}

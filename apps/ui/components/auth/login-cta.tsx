"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { onSessionChanged } from "@/lib/session-events";

/**
 * Renders its children (a "Đăng nhập" call-to-action) only for signed-out
 * visitors. Hidden while the session is loading and once signed in, so the
 * button never points a logged-in user at `/login`.
 */
export function LoginCta({ children }: { children: ReactNode }) {
  const [state, setState] = useState<"loading" | "out" | "in">("loading");

  const load = useCallback(() => {
    fetch("/api/auth/session")
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setState(data?.user ? "in" : "out"))
      .catch(() => setState("out"));
  }, []);

  useEffect(() => {
    load();
    return onSessionChanged(load);
  }, [load]);

  return state === "out" ? <>{children}</> : null;
}

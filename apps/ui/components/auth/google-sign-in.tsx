"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { emitSessionChanged } from "@/lib/session-events";

const GIS_SRC = "https://accounts.google.com/gsi/client";

/**
 * Minimal shape of the Google Identity Services global (only what we use).
 * `renderButton` is the current API (Google deprecated the legacy `render`
 * in 2024); older script builds may still expose `render` only.
 */
interface GoogleIdApi {
  initialize(config: {
    client_id: string;
    callback: (resp: { credential: string }) => void;
  }): void;
  renderButton?(el: HTMLElement, options?: Record<string, unknown>): void;
  render?(el: HTMLElement, options?: Record<string, unknown>): void;
}
interface GoogleNamespace {
  accounts: { id: GoogleIdApi };
}
declare global {
  interface Window {
    google?: GoogleNamespace;
  }
}

interface GoogleSignInProps {
  /** Optional fixed redirect target; when absent we honour `?from` then `/learn`. */
  fromHref?: string;
}

/**
 * Google Sign-In button (P2-UI / ADR-auth-provider). Uses the Google
 * Identity Services One-Tap flow: the button produces a signed ID-token
 * (`credential`), which we POST to `/api/auth/login` as `{ google }`. The
 * server verifies it via `google-auth-library` and sets the httpOnly session
 * cookie (P2-UI-05) — the browser never stores the token.
 *
 * Renders nothing when `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is unset, so the page
 * still works for email/password-only deployments.
 */
export function GoogleSignIn({ fromHref }: GoogleSignInProps) {
  const router = useRouter();
  const buttonRef = useRef<HTMLDivElement>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID ?? "";
  const signIn = useCallback(
    async (credential: string) => {
      setLoading(true);
      setError(null);

      let target: string;
      if (fromHref) {
        target = fromHref;
      } else {
        const from = new URLSearchParams(window.location.search).get("from");
        target = from && from.startsWith("/") ? from : "/learn";
      }

      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ google: credential }),
      }).catch(() => null);

      if (!res || !res.ok) {
        let message = "Có lỗi khi đăng nhập bằng Google. Thử lại sau.";
        try {
          const data = (await res?.json()) as { error?: string } | undefined;
          if (data?.error) message = data.error;
        } catch {
          // keep default
        }
        setError(message);
        setLoading(false);
        return;
      }

      emitSessionChanged();
      router.push(target);
      router.refresh();
    },
    [router, fromHref],
  );

  useEffect(() => {
    // Not configured → the button is simply not rendered.
    if (!clientId) return;

    let cancelled = false;

    function render() {
      if (cancelled || !buttonRef.current || !window.google) return;
      const id = window.google.accounts.id;
      id.initialize({
        client_id: clientId,
        callback: (response) => void signIn(response.credential),
      });
      const options = {
        type: "standard",
        theme: "outline",
        size: "large",
        width: "100%",
        text: "continue_with",
        shape: "rectangular",
        logo_alignment: "center",
      };
      // `renderButton` is the current API; `render` is the legacy fallback.
      if (typeof id.renderButton === "function") {
        id.renderButton(buttonRef.current, options);
      } else if (typeof id.render === "function") {
        id.render(buttonRef.current, options);
      }
    }

    const existing = document.querySelector<HTMLScriptElement>(
      `script[src="${GIS_SRC}"]`,
    );
    if (existing) {
      existing.addEventListener("load", render);
      return () => {
        cancelled = true;
        existing.removeEventListener("load", render);
      };
    }

    const script = document.createElement("script");
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener("load", render);
    document.head.appendChild(script);

    return () => {
      cancelled = true;
      script.removeEventListener("load", render);
    };
  }, [clientId, signIn]);

  if (!clientId) {
    // Not configured — show nothing (email/password path still works).
    return null;
  }

  return (
    <div className="mt-4">
      {/*
        The Google button is rendered by Google inside an iframe (GIS), so we
        only control the container it's dropped into. No extra border/
        rounded/Background here — the GIS button already carries its own
        outline + 4px corners, and adding a second frame makes it look like a
        double box. We just constrain the width so it matches the
        email/password button above.
      */}
      <div
        ref={buttonRef}
        aria-busy={loading}
        className={`w-full transition ${
          loading ? "pointer-events-none opacity-60" : ""
        } [&_iframe]:!w-full`}
      />
      {loading && (
        <p className="mt-2 text-center text-xs text-[var(--muted-foreground)]">
          Đang đăng nhập…
        </p>
      )}
      {error && (
        <p
          role="alert"
          className="mt-2 rounded-lg bg-[#fef2f2] px-3 py-2 text-sm text-[#b91c1c]"
        >
          {error}
        </p>
      )}
    </div>
  );
}

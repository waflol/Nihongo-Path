"use client";

/**
 * Install-prompt store (docs/plans/plan-pwa.md, P1).
 *
 * Chrome/Edge fire `beforeinstallprompt` once, early in the page load —
 * usually before the component that shows the install button has mounted.
 * So the event is captured here at module load (imported by the always-
 * mounted ServiceWorkerRegister) and kept until a component asks for it.
 */

/** Chromium-only event, not in the TS DOM lib. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    // Keep Chrome's mini-infobar from showing; we offer our own button.
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    installed = true;
    emit();
  });
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** True when the browser offered an install prompt we can show. */
export function canPromptInstall(): boolean {
  return deferred !== null;
}

export function justInstalled(): boolean {
  return installed;
}

/** Show the browser's install dialog. Resolves true when the user accepted. */
export async function promptInstall(): Promise<boolean> {
  const event = deferred;
  if (!event) return false;
  deferred = null; // a prompt event can only be used once
  emit();
  await event.prompt();
  const { outcome } = await event.userChoice;
  return outcome === "accepted";
}

/** Running as an installed app (home-screen icon), not in a browser tab. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's own flag for home-screen web apps.
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** iPhone/iPad, including iPadOS reporting itself as a Mac. */
export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

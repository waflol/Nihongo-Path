/**
 * Client-side session-change bus (P2-UI-06).
 *
 * `AuthForm` / `GoogleSignIn` call `emitSessionChanged()` after a successful
 * login so that mounted components (e.g. the header `AccountMenu`) can
 * re-fetch `/api/auth/session` without a full page reload. Server route
 * handlers own the cookie (P2-UI-05); this only notifies the client.
 */

type Listener = () => void;

let listeners: Set<Listener> | null = null;

function getListeners(): Set<Listener> {
  if (!listeners) listeners = new Set();
  return listeners;
}

export function emitSessionChanged(): void {
  getListeners().forEach((l) => l());
}

export function onSessionChanged(listener: Listener): () => void {
  getListeners().add(listener);
  return () => {
    getListeners().delete(listener);
  };
}

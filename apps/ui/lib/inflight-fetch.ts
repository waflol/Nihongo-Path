/**
 * GET that joins an identical request already in flight instead of sending a
 * second one — e.g. the two header account menus (desktop + mobile) reading the
 * session together, or React strict-mode running an effect twice in dev.
 * Nothing is cached once the response arrives, so later calls are always fresh.
 */
const pending = new Map<string, Promise<Response>>();

export function fetchShared(url: string, init?: RequestInit): Promise<Response> {
  let p = pending.get(url);
  if (!p) {
    p = fetch(url, init);
    pending.set(url, p);
    const clear = () => {
      if (pending.get(url) === p) pending.delete(url);
    };
    p.then(clear, clear);
  }
  // Each caller reads its own copy of the body.
  return p.then((res) => res.clone());
}

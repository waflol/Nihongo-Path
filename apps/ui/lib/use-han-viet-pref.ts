"use client";

import { useCallback, useSyncExternalStore } from "react";

const KEY = "np.showHanViet";
const EVENT = "np:hanviet-pref";

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}

function read(): boolean {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}

/** Show / hide the Hán Việt reading — one remembered switch for every screen. */
export function useHanVietPref(): [boolean, () => void] {
  const value = useSyncExternalStore(subscribe, read, () => true);
  const toggle = useCallback(() => {
    try {
      localStorage.setItem(KEY, read() ? "0" : "1");
    } catch {
      /* ignore */
    }
    window.dispatchEvent(new Event(EVENT));
  }, []);
  return [value, toggle];
}

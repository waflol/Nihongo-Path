"use client";

import { useSyncExternalStore } from "react";
import { JLPT_LEVELS } from "@/components/learn/level-select";

/** The JLPT level whose exam structure the learner picked last, remembered on this device. */

const KEY = "jlpt-exam-level";
const CHANGED = "jlpt-exam-level-changed";
/** Used when storage is unavailable, so a pick still holds until a reload. */
let memory = "";

const isLevel = (v: string) => (JLPT_LEVELS as readonly string[]).includes(v);

function read(): string {
  try {
    const v = localStorage.getItem(KEY) ?? memory;
    return isLevel(v) ? v : "";
  } catch {
    return memory;
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGED, onChange);
  window.addEventListener("storage", onChange); // another tab
  return () => {
    window.removeEventListener(CHANGED, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function remember(level: string) {
  if (!isLevel(level)) return;
  memory = level;
  try {
    localStorage.setItem(KEY, level);
  } catch {
    /* storage unavailable */
  }
  window.dispatchEvent(new Event(CHANGED));
}

/** `["", remember]` until a level has been picked (and while rendering on the server). */
export function useExamLevel(): [string, (level: string) => void] {
  return [useSyncExternalStore(subscribe, read, () => ""), remember];
}

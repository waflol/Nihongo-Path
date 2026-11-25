"use client";

import { type DragEvent, type ReactNode, useState } from "react";
import { FormattedText } from "./rich-text";

/**
 * 文の組み立て (★) questions: the four words are arranged on the sentence's four
 * blanks, and the word on the ★ blank is the answer.
 */

export interface StarParts {
  before: string;
  after: string;
  /** Which blank carries the ★, 0-based. */
  star: number;
}

const RUN = /(?:<\/?u>|[_＿★ \t　])*[_＿](?:<\/?u>|[_＿★ \t　])*/g;

/**
 * Split a prompt around its written-out blanks (`___ ___ _★_ ___`). `null` when it
 * does not show exactly four with one ★ — then the ★ position is unknown and the
 * prompt is shown as it is.
 */
export function starParts(prompt: string): StarParts | null {
  for (const m of prompt.matchAll(RUN)) {
    const slots = m[0].replace(/<\/?u>/g, "").split(/[ \t　]+/).filter(Boolean);
    const stars = slots.flatMap((s, i) => (s.includes("★") ? [i] : []));
    if (slots.length !== 4 || stars.length !== 1 || slots.some((s) => !/[_＿]/.test(s))) continue;
    return { before: prompt.slice(0, m.index).trimEnd(), after: prompt.slice(m.index + m[0].length).trimStart(), star: stars[0] };
  }
  return null;
}

const DRAG = "text/x-star-option";

/** What the option buttons under the sentence need. */
export interface StarControls {
  /** Put the word on the next free blank. */
  place: (option: number) => void;
  /** Which blank a word is on, or -1. */
  blankOf: (option: number) => number;
  drag: (option: number) => { draggable: boolean; onDragStart: (e: DragEvent) => void };
}

export function StarSentence({
  parts,
  options,
  picked,
  onPick,
  disabled,
  children,
}: {
  parts: StarParts;
  options: string[];
  /** The answer (0-based option), i.e. the word on the ★ blank. */
  picked: number | null;
  onPick: (option: number | null) => void;
  disabled?: boolean;
  children: (controls: StarControls) => ReactNode;
}) {
  const { star } = parts;
  /** The words on the other three blanks — working notes, not part of the answer. */
  const [rest, setRest] = useState<(number | null)[]>([null, null, null, null]);
  const slots = rest.map((o, i) => (i === star ? picked : o === picked ? null : o));

  function apply(next: (number | null)[]) {
    setRest(next);
    if (next[star] !== picked) onPick(next[star]);
  }
  /** Move a word to blank `to`; a word already there takes the mover's old blank. */
  function move(option: number, to: number) {
    if (disabled) return;
    const next = [...slots];
    const from = next.indexOf(option);
    const there = next[to];
    if (from >= 0) next[from] = there;
    next[to] = option;
    apply(next);
  }
  function clear(at: number) {
    if (!disabled) apply(slots.map((o, i) => (i === at ? null : o)));
  }
  const controls: StarControls = {
    place: (option) => {
      const free = slots.indexOf(null);
      if (!slots.includes(option) && free >= 0) move(option, free);
    },
    blankOf: (option) => slots.indexOf(option),
    drag: (option) => ({
      draggable: !disabled,
      onDragStart: (e) => {
        e.dataTransfer.setData(DRAG, String(option));
        e.dataTransfer.effectAllowed = "move";
      },
    }),
  };

  return (
    <>
      <p className="whitespace-pre-wrap leading-[3]" lang="ja">
        <FormattedText text={parts.before} />
        {slots.map((o, i) => (
          <button
            key={i}
            type="button"
            disabled={disabled || o === null}
            onClick={(e) => {
              e.stopPropagation();
              clear(i);
            }}
            onDragOver={(e) => {
              if (!disabled && e.dataTransfer.types.includes(DRAG)) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              const option = Number(e.dataTransfer.getData(DRAG));
              if (Number.isInteger(option) && option >= 0 && option < options.length) move(option, i);
            }}
            {...(o === null ? {} : controls.drag(o))}
            aria-label={`Ô ${i + 1}${i === star ? " (★)" : ""}: ${o === null ? "trống" : "bấm để lấy chữ ra"}`}
            className={`mx-1 inline-flex min-h-9 min-w-[4.5em] items-center justify-center border-b-2 px-2 align-middle leading-7 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] enabled:cursor-pointer disabled:cursor-default ${
              i === star ? "border-[var(--primary)] bg-[color-mix(in_srgb,var(--primary)_10%,transparent)]" : "border-current"
            }`}
          >
            {i === star && <span className={o === null ? "" : "mr-1 text-xs text-[var(--primary)]"}>★</span>}
            {o !== null && <FormattedText text={options[o]} />}
          </button>
        ))}
        <FormattedText text={parts.after} />
      </p>
      {children(controls)}
    </>
  );
}

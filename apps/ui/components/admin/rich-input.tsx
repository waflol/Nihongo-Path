"use client";

import { useLayoutEffect, useRef } from "react";

/**
 * Word-like text field: bold / italic / underline / furigana / text size shown as such,
 * stored as `<b>` `<i>` `<u>`, `<ruby=reading>base</ruby>` and `<size=percent>` tags.
 */

/** `r` is the furigana element a run belongs to (one object per element, so neighbours stay apart). */
type Fmt = { b: boolean; i: boolean; u: boolean; size?: string; r?: { reading: string } };

/** Text sizes offered, with the `<font size>` the browser's `fontSize` command writes for each. */
export const TEXT_SIZES = [
  { label: "Nhỏ", font: "2", percent: "80" },
  { label: "Thường", font: "3", percent: "" },
  { label: "Lớn", font: "5", percent: "125" },
  { label: "Rất lớn", font: "6", percent: "150" },
];

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const rubyHtml = (baseHtml: string, reading: string) => `<ruby>${baseHtml}<rt contenteditable="false">${reading}</rt></ruby>`;
/** Only the known tags become markup; everything else is escaped. */
const toHtml = (value: string) =>
  escapeHtml(value)
    .replace(/&lt;ruby=((?:(?!&[lg]t;)[^\n])+)&gt;((?:(?!&lt;\/?ruby)[\s\S])*)&lt;\/ruby&gt;/g, (_, reading: string, base: string) => rubyHtml(base, reading))
    .replace(/&lt;size=(80|125|150)&gt;/g, (_, p: string) => `<font size="${TEXT_SIZES.find((s) => s.percent === p)!.font}">`)
    .replace(/&lt;\/size&gt;/g, "</font>")
    .replace(/&lt;(\/?[biu])&gt;/g, "<$1>");

/** The words picked for furigana, remembered while the popup holds the focus. */
export interface FuriganaPick {
  /** The words without any reading. */
  base: string;
  /** The reading they carry now; "" when none, or when several separate readings were picked. */
  reading: string;
  /** Whether there is any furigana to remove. */
  annotated: boolean;
  /** Where the words are on screen now (they move when the page scrolls). */
  rect: () => DOMRect;
  /** Replace the furigana with these pieces (`rt` = reading over `text`; none removes it). */
  apply: (pieces: { text: string; rt?: string }[]) => void;
  /** Give the field its focus and selection back. */
  restore: () => boolean;
}

const elementOf = (n: Node) => (n instanceof Element ? n : n.parentElement);

/**
 * Read the selection of a `RichInput` for furigana; `null` when there are no words
 * (on one line) to annotate. A caret or selection touching a furigana takes all of it.
 */
export function pickFurigana(): FuriganaPick | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0).cloneRange();
  const field = elementOf(range.commonAncestorContainer)?.closest<HTMLElement>('[role="textbox"][contenteditable="true"]');
  if (!field) return null;
  const first = elementOf(range.startContainer)?.closest("ruby");
  const last = elementOf(range.endContainer)?.closest("ruby");
  if (first) range.setStartBefore(first);
  if (last) range.setEndAfter(last);
  const picked = range.cloneContents();
  const readings = [...picked.querySelectorAll("ruby")].map((r) => r.querySelector("rt")?.textContent ?? "");
  const only = readings.length === 1 ? picked.querySelector("ruby")!.cloneNode(true) : null;
  picked.querySelectorAll("rt").forEach((rt) => rt.remove());
  const base = picked.textContent ?? "";
  if (!base.trim() || base.includes("\n") || picked.querySelector("br, div, p")) return null;

  const restore = () => {
    if (!range.startContainer.isConnected || !range.endContainer.isConnected) return false;
    field.focus({ preventScroll: true });
    const now = window.getSelection();
    now?.removeAllRanges();
    now?.addRange(range);
    return true;
  };

  return {
    base,
    // One furigana over exactly the picked words is "the reading"; a part of them is not.
    reading: only && only.textContent?.replace(readings[0], "") === base ? readings[0] : "",
    annotated: readings.length > 0,
    rect: () => range.getBoundingClientRect(),
    restore,
    // Goes through `insertHTML`, so Ctrl+Z undoes it.
    apply(pieces) {
      if (!restore()) return;
      let html = pieces
        .map((p) => {
          const rt = (p.rt ?? "").replace(/[<>\n]/g, "").trim();
          return rt ? rubyHtml(escapeHtml(p.text), escapeHtml(rt)) : escapeHtml(p.text);
        })
        .join("");
      // `insertHTML` drops the formatting around what it replaces, so put it back.
      for (const tag of ["u", "i", "b"]) {
        const around = elementOf(range.commonAncestorContainer)?.closest(tag);
        if ((around && field.contains(around)) || picked.querySelector(tag)) html = `<${tag}>${html}</${tag}>`;
      }
      const sized = elementOf(range.commonAncestorContainer)?.closest("font[size]") ?? picked.querySelector("font[size]");
      const size = sized && sized !== field ? sized.getAttribute("size") : null;
      if (size && /^[2356]$/.test(size)) html = `<font size="${size}">${html}</font>`;
      document.execCommand("insertHTML", false, html);
    },
  };
}

/** The editable DOM back to tagged text, whatever markup the browser produced. */
function serialize(root: HTMLElement): string {
  const runs: { text: string; f: Fmt }[] = [];
  let last = "";
  const push = (text: string, f: Fmt) => {
    if (!text) return;
    runs.push({ text, f });
    last = text[text.length - 1];
  };
  const walk = (node: Node, f: Fmt) => {
    if (node.nodeType === Node.TEXT_NODE) {
      push((node.textContent ?? "").replace(/ /g, " "), f);
      return;
    }
    if (!(node instanceof HTMLElement) || node.tagName === "RT" || node.tagName === "RP") return;
    if (node.tagName === "RUBY" && !f.r) {
      const reading = [...node.querySelectorAll("rt")].map((rt) => rt.textContent ?? "").join("").replace(/[<>\n]/g, "");
      const from = runs.length;
      node.childNodes.forEach((c) => walk(c, { ...f, r: { reading } }));
      // A reading covers its whole base: formats applied to part of it apply to all of it.
      const inner = runs.slice(from);
      const all: Fmt = {
        b: inner.some((x) => x.f.b),
        i: inner.some((x) => x.f.i),
        u: inner.some((x) => x.f.u),
        size: inner[0]?.f.size,
        r: reading && inner.length > 0 ? inner[0].f.r : undefined,
      };
      inner.forEach((x) => (x.f = all));
      return;
    }
    if (node.tagName === "BR") {
      push("\n", f);
      return;
    }
    const s = node.style;
    const next = { ...f };
    if (node.tagName === "B" || node.tagName === "STRONG") next.b = true;
    if (node.tagName === "I" || node.tagName === "EM") next.i = true;
    if (node.tagName === "U") next.u = true;
    if (node.tagName === "FONT" && node.hasAttribute("size")) {
      next.size = TEXT_SIZES.find((x) => x.font === node.getAttribute("size"))?.percent || undefined;
    }
    if (s.fontWeight) next.b = s.fontWeight === "bold" || Number(s.fontWeight) >= 600;
    if (s.fontStyle) next.i = s.fontStyle === "italic";
    if (s.textDecorationLine.includes("underline")) next.u = true;
    if ((node.tagName === "DIV" || node.tagName === "P") && last && last !== "\n") push("\n", f);
    node.childNodes.forEach((c) => walk(c, next));
  };
  root.childNodes.forEach((c) => walk(c, { b: false, i: false, u: false }));

  let out = "";
  // Open tags, outermost first; furigana is innermost so an underline runs across it unbroken.
  let open: (string | { reading: string })[] = [];
  const openTag = (t: string | { reading: string }) => (typeof t === "string" ? `<${t}>` : `<ruby=${t.reading}>`);
  const closeTag = (t: string | { reading: string }) => (typeof t === "string" ? `</${t.split("=")[0]}>` : "</ruby>");
  const switchTo = (want: typeof open) => {
    let keep = 0;
    while (keep < open.length && open[keep] === want[keep]) keep += 1;
    out += open.slice(keep).reverse().map(closeTag).join("") + want.slice(keep).map(openTag).join("");
    open = want;
  };
  for (const r of runs) {
    const size = r.f.size ? [`size=${r.f.size}`] : [];
    switchTo([...size, ...(["b", "i", "u"] as const).filter((t) => r.f[t]), ...(r.f.r ? [r.f.r] : [])]);
    out += r.text;
  }
  switchTo([]);
  return out.replace(/\n$/, ""); // the browser's caret placeholder
}

export function RichInput({
  value,
  onChange,
  multiline = true,
  className,
  placeholder,
  label,
  onFocus,
  onBlur,
}: {
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  className?: string;
  placeholder?: string;
  label?: string;
  onFocus?: () => void;
  onBlur?: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const emitted = useRef<string | null>(null);
  // Only rewrite the DOM for a change made elsewhere, so the caret and undo history survive typing.
  useLayoutEffect(() => {
    if (!ref.current || emitted.current === value) return;
    ref.current.innerHTML = toHtml(value);
    emitted.current = value;
  }, [value]);
  return (
    <div
      ref={ref}
      role="textbox"
      aria-multiline={multiline}
      aria-label={label ?? placeholder}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      onFocus={() => {
        document.execCommand("styleWithCSS", false, "false");
        onFocus?.();
      }}
      onBlur={onBlur}
      onInput={(e) => {
        const next = serialize(e.currentTarget);
        emitted.current = next;
        onChange(next);
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
        e.preventDefault();
        if (multiline) document.execCommand("insertLineBreak");
      }}
      onPaste={(e) => {
        // Paste as plain text: styles copied from a web page / PDF viewer must not sneak in.
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain").replace(/\r\n?/g, "\n");
        document.execCommand("insertText", false, multiline ? text : text.replace(/\n+/g, " "));
      }}
      onDrop={(e) => e.preventDefault()}
      className={`block w-full whitespace-pre-wrap break-words outline-none [&_rt]:select-none [&_rt]:text-[0.55em] [&_u]:underline-offset-4 [&_font[size='2']]:text-[0.8em] [&_font[size='3']]:text-[1em] [&_font[size='5']]:text-[1.25em] [&_font[size='6']]:text-[1.5em] empty:before:font-normal empty:before:text-[var(--muted-foreground)] empty:before:content-[attr(data-placeholder)] ${className ?? ""}`}
    />
  );
}

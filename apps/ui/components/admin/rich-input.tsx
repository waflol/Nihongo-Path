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

/**
 * Put furigana on the selected words of a `RichInput`, change it, or (empty reading) remove it.
 * Goes through `insertHTML`, so Ctrl+Z undoes it.
 */
export function editFurigana(): void {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0) return;
  const range = sel.getRangeAt(0).cloneRange();
  const elementOf = (n: Node) => (n instanceof Element ? n : n.parentElement);
  const field = elementOf(range.commonAncestorContainer)?.closest<HTMLElement>('[role="textbox"][contenteditable="true"]');
  const ruby = elementOf(range.startContainer)?.closest("ruby");
  if (ruby) range.selectNode(ruby);
  const picked = range.cloneContents();
  const old = ruby?.querySelector("rt")?.textContent ?? "";
  picked.querySelectorAll("rt").forEach((rt) => rt.remove());
  const base = (picked.textContent ?? "").trim() ? (picked.textContent ?? "") : "";
  if (!field || !base || base.includes("\n")) {
    window.alert("Bôi đen chữ cần phiên âm (trên một dòng) rồi bấm Furigana.");
    return;
  }
  const reading = window.prompt(`Cách đọc của “${base}” (để trống để bỏ furigana)`, old);
  if (reading === null) return;
  const clean = reading.replace(/[<>\n]/g, "").trim();
  field.focus();
  sel.removeAllRanges();
  sel.addRange(range);
  let html = clean ? rubyHtml(escapeHtml(base), escapeHtml(clean)) : escapeHtml(base);
  // `insertHTML` drops the formatting around what it replaces, so put it back.
  for (const tag of ["u", "i", "b"]) {
    const around = elementOf(range.commonAncestorContainer)?.closest(tag);
    if ((around && field.contains(around)) || picked.querySelector(tag)) html = `<${tag}>${html}</${tag}>`;
  }
  const sized = elementOf(range.commonAncestorContainer)?.closest("font[size]") ?? picked.querySelector("font[size]");
  const size = sized && sized !== field ? sized.getAttribute("size") : null;
  if (size && /^[2356]$/.test(size)) html = `<font size="${size}">${html}</font>`;
  document.execCommand("insertHTML", false, html);
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

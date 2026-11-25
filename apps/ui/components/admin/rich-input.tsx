"use client";

import { useLayoutEffect, useRef } from "react";

/** Word-like text field: bold / italic / underline shown as such, stored as `<b>` `<i>` `<u>` tags. */

type Fmt = { b: boolean; i: boolean; u: boolean };

const escapeHtml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
/** Only the three known tags become markup; everything else is escaped. */
const toHtml = (value: string) => escapeHtml(value).replace(/&lt;(\/?[biu])&gt;/g, "<$1>");

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
    if (!(node instanceof HTMLElement)) return;
    if (node.tagName === "BR") {
      push("\n", f);
      return;
    }
    const s = node.style;
    const next = { ...f };
    if (node.tagName === "B" || node.tagName === "STRONG") next.b = true;
    if (node.tagName === "I" || node.tagName === "EM") next.i = true;
    if (node.tagName === "U") next.u = true;
    if (s.fontWeight) next.b = s.fontWeight === "bold" || Number(s.fontWeight) >= 600;
    if (s.fontStyle) next.i = s.fontStyle === "italic";
    if (s.textDecorationLine.includes("underline")) next.u = true;
    if ((node.tagName === "DIV" || node.tagName === "P") && last && last !== "\n") push("\n", f);
    node.childNodes.forEach((c) => walk(c, next));
  };
  root.childNodes.forEach((c) => walk(c, { b: false, i: false, u: false }));

  let out = "";
  let open: ("b" | "i" | "u")[] = [];
  for (const r of runs) {
    const want = (["b", "i", "u"] as const).filter((t) => r.f[t]);
    if (want.join() !== open.join()) {
      out += [...open].reverse().map((t) => `</${t}>`).join("") + want.map((t) => `<${t}>`).join("");
      open = [...want];
    }
    out += r.text;
  }
  out += [...open].reverse().map((t) => `</${t}>`).join("");
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
      className={`block w-full whitespace-pre-wrap break-words outline-none empty:before:font-normal empty:before:text-[var(--muted-foreground)] empty:before:content-[attr(data-placeholder)] ${className ?? ""}`}
    />
  );
}

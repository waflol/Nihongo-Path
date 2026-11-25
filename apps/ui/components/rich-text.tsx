import type { ReactNode } from "react";

/**
 * Exam text carries only these formats, stored inline: `<b>`, `<i>`, `<u>`,
 * furigana `<ruby=まね>真似</ruby>` and text size `<size=125>…</size>` (percent: 80,
 * 125 or 150) — what the draft editor writes. Anything else, including other `<…>`,
 * is shown literally; no HTML is ever injected.
 */
const TAG = /(<\/?[biu]>|<ruby=[^<>\n]+>|<\/ruby>|<size=(?:80|125|150)>|<\/size>)/;
const TAGS = new RegExp(TAG.source.slice(1, -1), "g");

/** The words only: formatting tags and furigana readings removed. */
export const stripFormat = (text: string): string => text.replace(TAGS, "");

type Tag = "b" | "i" | "u" | "ruby" | "size";

export function FormattedText({ text }: { text: string }) {
  if (!text.includes("<")) return <>{text}</>;
  const root: ReactNode[] = [];
  /** `value` is the furigana reading, or the size in percent. */
  const stack: { tag: Tag; value: string; children: ReactNode[] }[] = [];
  let key = 0;
  const top = () => stack[stack.length - 1]?.children ?? root;
  const close = () => {
    const f = stack.pop()!;
    if (f.tag === "ruby") {
      top().push(
        <ruby key={key++}>
          {f.children}
          <rt className="select-none text-[0.55em] font-normal">{f.value}</rt>
        </ruby>,
      );
      return;
    }
    if (f.tag === "size") {
      top().push(
        <span key={key++} style={{ fontSize: `${Number(f.value) / 100}em` }}>
          {f.children}
        </span>,
      );
      return;
    }
    const El = f.tag;
    top().push(
      <El key={key++} className={El === "u" ? "underline underline-offset-4" : El === "b" ? "font-bold" : "italic"}>
        {f.children}
      </El>,
    );
  };
  // `split` with one capture group puts the tags at the odd positions.
  text.split(TAG).forEach((part, n) => {
    if (!part) return;
    if (n % 2 === 0) top().push(part);
    else if (part[1] !== "/") {
      const [tag, value = ""] = part.slice(1, -1).split(/=(.*)/);
      stack.push({ tag: tag as Tag, value, children: [] });
    } else {
      const tag = part.slice(2, -1);
      if (!stack.some((f) => f.tag === tag)) return;
      while (stack[stack.length - 1].tag !== tag) close();
      close();
    }
  });
  while (stack.length > 0) close();
  return <>{root}</>;
}

/**
 * The credit line that closes a JLPT passage — （大林宣彦『…』PHP研究所） or （…による） —
 * possibly glued to the last sentence by the PDF text extraction.
 */
const SOURCE = /(?:\n|(?<=[。」』）]))[ \t　]*([（(][^（()）\n]*(?:『|より|による)[^（()）\n]*[）)])\s*$/;

/** A passage body as printed: the text, then its source line set to the right. */
export function PassageText({ text, className = "" }: { text: string; className?: string }) {
  const m = SOURCE.exec(text);
  return (
    <div className={className}>
      <p className="whitespace-pre-wrap">
        <FormattedText text={m ? text.slice(0, m.index).trimEnd() : text} />
      </p>
      {m && (
        <p className="mt-2 text-right text-[0.85em]">
          <FormattedText text={m[1]} />
        </p>
      )}
    </div>
  );
}

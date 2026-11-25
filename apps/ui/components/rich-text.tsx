import type { ReactNode } from "react";

/**
 * Exam text carries only three formats, stored inline as `<b>`, `<i>`, `<u>`
 * (what the draft editor writes). Anything else — including other `<…>` — is
 * shown literally; no HTML is ever injected.
 */
const TAG = /(<\/?[biu]>)/;

export const stripFormat = (text: string): string => text.replace(/<\/?[biu]>/g, "");

export function FormattedText({ text }: { text: string }) {
  if (!text.includes("<")) return <>{text}</>;
  const root: ReactNode[] = [];
  const stack: { tag: "b" | "i" | "u"; children: ReactNode[] }[] = [];
  let key = 0;
  const top = () => stack[stack.length - 1]?.children ?? root;
  const close = () => {
    const f = stack.pop()!;
    const Tag = f.tag;
    top().push(
      <Tag key={key++} className={Tag === "u" ? "underline underline-offset-4" : Tag === "b" ? "font-bold" : "italic"}>
        {f.children}
      </Tag>,
    );
  };
  for (const part of text.split(TAG)) {
    if (!part) continue;
    if (!TAG.test(part)) top().push(part);
    else if (part[1] !== "/") stack.push({ tag: part[1] as "b", children: [] });
    else if (stack.some((f) => f.tag === part[2])) {
      while (stack[stack.length - 1].tag !== part[2]) close();
      close();
    }
  }
  while (stack.length > 0) close();
  return <>{root}</>;
}

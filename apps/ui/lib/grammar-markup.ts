/**
 * Inline markup of imported grammar text: `漢字[かんじ]` carries a reading and
 * `{…}` marks the pattern being taught.
 */
export interface JaSegment {
  text: string;
  rt?: string;
  mark?: boolean;
}

const TOKEN = /([{}])|([一-鿿々ヶ0-9０-９]+)\[([ぁ-ヿ]+)\]/g;

export function parseJaMarkup(source: string): JaSegment[] {
  const out: JaSegment[] = [];
  let mark = false;
  let last = 0;
  const push = (text: string, rt?: string) => {
    if (text) out.push({ text, ...(rt ? { rt } : {}), ...(mark ? { mark } : {}) });
  };
  for (const m of source.matchAll(TOKEN)) {
    push(source.slice(last, m.index));
    if (m[1]) mark = m[1] === "{";
    else push(m[2], m[3]);
    last = m.index + m[0].length;
  }
  push(source.slice(last));
  return out;
}

export const hasJaMarkup = (source: string) => /[{}]|\[[ぁ-ヿ]+\]/.test(source);

/** The text as written, without readings or pattern braces. */
export const stripJaMarkup = (source: string) => parseJaMarkup(source).map((p) => p.text).join("");

/** What to pronounce: annotated words by their reading. */
export const jaMarkupSpeech = (source: string) => parseJaMarkup(source).map((p) => p.rt ?? p.text).join("");

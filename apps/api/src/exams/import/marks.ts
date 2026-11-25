/**
 * Furigana and underlines of a text PDF (NP-407). Neither survives plain text
 * extraction: furigana is small kana set above a line, an underline is a drawn
 * path. Both are read from the page geometry as `Mark`s — the marked words plus
 * the text around them — and put back as tags on the structured block, so
 * segmentation, the rules, the AI and its grounding check keep seeing plain text.
 */

export interface Mark {
  /** `star`: a 文の組み立て sentence — which of its four blanks carries the ★. */
  kind: "u" | "ruby" | "star";
  /** `star` only: the ★ blank, 0-based. */
  slot?: number;
  /** The marked words, as printed. */
  text: string;
  /** Furigana reading (`ruby` only). */
  reading?: string;
  /** Text just before / after on the same line, to find the right occurrence again. */
  before: string;
  after: string;
}

/**
 * A furigana line as plain extraction used to leave it: the readings run together,
 * just before the line they belong to (whose first characters are `next`).
 */
export interface Junk {
  text: string;
  next: string;
}

/** A positioned run of text (PDF user space: y grows upward, `h` is the font size). */
export interface TextRun {
  x: number;
  y: number;
  w: number;
  h: number;
  s: string;
}

/** A drawn horizontal or vertical stroke / hairline rectangle, as its bounding box. */
export interface Rule {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

const CONTEXT = 8;
const KANA_ONLY = /^[぀-ヿー・\s　]+$/;
const KANJI = /[一-鿿㐀-䶿々〆ヶ]/;

interface Char {
  c: string;
  x0: number;
  x1: number;
}
interface Line {
  y: number;
  h: number;
  chars: Char[];
}

/** Half-width characters take half the advance of full-width ones; the run's real width fixes the scale. */
const units = (c: string) => (/[ -~｡-ﾟ]/.test(c) ? 0.5 : 1);

function toLines(runs: TextRun[]): Line[] {
  const lines: Line[] = [];
  for (const r of [...runs].sort((a, b) => b.y - a.y || a.x - b.x)) {
    let line = lines[lines.length - 1];
    if (!line || Math.abs(line.y - r.y) >= 4) lines.push((line = { y: r.y, h: r.h, chars: [] }));
    line.h = Math.max(line.h, r.h);
    const cs = [...r.s];
    const per = r.w / Math.max(0.5, cs.reduce((n, c) => n + units(c), 0));
    let x = r.x;
    for (const c of cs) {
      const w = units(c) * per;
      line.chars.push({ c, x0: x, x1: x + w });
      x += w;
    }
  }
  for (const l of lines) l.chars.sort((a, b) => a.x0 - b.x0);
  return lines;
}

const join = (cs: Char[]) => cs.map((c) => c.c).join("");
const markAt = (line: Line, from: number, to: number) => ({
  text: join(line.chars.slice(from, to + 1)),
  before: join(line.chars.slice(Math.max(0, from - CONTEXT * 2), from)).replace(/\s/g, "").slice(-CONTEXT),
  after: join(line.chars.slice(to + 1, to + 1 + CONTEXT * 2)).replace(/\s/g, "").slice(0, CONTEXT),
});

/**
 * Split a page's runs into the body text and the furigana set above it. A small
 * kana run that sits on no kanji is not furigana and stays in the body.
 */
export function extractFurigana(runs: TextRun[]): { body: TextRun[]; marks: Mark[]; junk: Junk[] } {
  const bodyHeights = runs.filter((r) => r.s.trim()).map((r) => r.h).sort((a, b) => a - b);
  const typical = bodyHeights[Math.floor(bodyHeights.length / 2)] ?? 0;
  const small = (r: TextRun) => r.h > 0 && r.h <= typical * 0.65 && r.s.trim() !== "" && KANA_ONLY.test(r.s);
  const lines = toLines(runs.filter((r) => !small(r) && r.s.trim()));

  type Hit = { line: Line; from: number; to: number; reading: string; run: TextRun };
  const hits: Hit[] = [];
  const used = new Set<TextRun>();
  for (const run of runs.filter(small).sort((a, b) => b.y - a.y || a.x - b.x)) {
    // The base line: the nearest one below, within about one line of body text.
    const line = lines.find((l) => run.y - l.y > l.h * 0.6 && run.y - l.y < l.h * 1.5 && run.h <= l.h * 0.65);
    if (!line) continue;
    const under = line.chars
      .map((ch, i) => ({ ch, i }))
      .filter(({ ch }) => KANJI.test(ch.c) && (ch.x0 + ch.x1) / 2 > run.x - run.h * 0.5 && (ch.x0 + ch.x1) / 2 < run.x + run.w + run.h * 0.5);
    if (under.length === 0) continue;
    // One unbroken stretch of kanji.
    let to = under[0].i;
    for (const u of under.slice(1)) if (u.i === to + 1) to = u.i;
    used.add(run);
    const prev = hits[hits.length - 1];
    const reading = run.s.replace(/[\s　<>]/g, "");
    // 真似 printed as ま over 真 and ね over 似 is one word.
    if (prev && prev.line === line && under[0].i === prev.to + 1 && run.x - (prev.run.x + prev.run.w) <= line.h * 1.5) {
      prev.to = to;
      prev.reading += reading;
      prev.run = run;
    } else hits.push({ line, from: under[0].i, to, reading, run });
  }
  const junk = new Map<Line, string>();
  for (const h of hits) junk.set(h.line, (junk.get(h.line) ?? "") + h.reading);
  return {
    junk: [...junk].map(([line, text]) => ({ text, next: join(line.chars).replace(/\s/g, "").slice(0, CONTEXT) })),
    body: runs.filter((r) => !used.has(r)),
    marks: hits.map((h) => ({ kind: "ruby" as const, ...markAt(h.line, h.from, h.to), reading: h.reading })),
  };
}

/**
 * The underlined words: a horizontal rule just under a line's baseline. Rules
 * that touch a vertical stroke are table or box borders, not underlines.
 */
export function findUnderlines(body: TextRun[], rules: Rule[]): Mark[] {
  const thin = rules.filter((r) => r.y1 - r.y0 <= 1.2 && r.x1 - r.x0 >= 5);
  const upright = rules.filter((r) => r.x1 - r.x0 <= 1.2 && r.y1 - r.y0 >= 5);
  const boxed = (r: Rule) =>
    upright.some((v) => (Math.abs(v.x0 - r.x0) < 2 || Math.abs(v.x0 - r.x1) < 2) && v.y0 - 2 <= r.y1 && v.y1 + 2 >= r.y0);
  const lines = toLines(body.filter((r) => r.s.trim()));
  const marks: Mark[] = [];
  for (const r of thin) {
    if (boxed(r)) continue;
    const y = (r.y0 + r.y1) / 2;
    const line = lines.find((l) => l.y - y >= 0 && l.y - y <= l.h * 0.4);
    if (!line) continue;
    const inside = line.chars.map((ch, i) => ({ ch, i })).filter(({ ch }) => (ch.x0 + ch.x1) / 2 > r.x0 && (ch.x0 + ch.x1) / 2 < r.x1);
    // A blank to fill in (＿＿) has a rule and no words.
    while (inside.length > 0 && !inside[0].ch.c.trim()) inside.shift();
    while (inside.length > 0 && !inside[inside.length - 1].ch.c.trim()) inside.pop();
    if (inside.length === 0) continue;
    marks.push({ kind: "u", ...markAt(line, inside[0].i, inside[inside.length - 1].i) });
  }
  return marks;
}

/** Width of one of the four blanks of a ★ sentence, in body-text heights (≈3–4 characters). */
const BLANK_EMS = 3.6;

/**
 * Where the ★ sits among the four blanks of its line, from the drawn rules (their
 * text is only spaces). Blanks drawn as one long rule are counted by width. A line
 * whose rules do not add up to exactly four blanks gets no mark.
 */
export function findStarSlots(body: TextRun[], rules: Rule[]): Mark[] {
  const marks: Mark[] = [];
  for (const line of toLines(body.filter((r) => r.s.trim()))) {
    const at = line.chars.findIndex((c) => c.c === "★");
    if (at < 0) continue;
    const star = (line.chars[at].x0 + line.chars[at].x1) / 2;
    const words = line.chars.filter((c) => c.c.trim() && c.c !== "★");
    // The blank region: between the words before and after the ★.
    const from = Math.max(-Infinity, ...words.filter((c) => c.x1 <= star).map((c) => c.x1));
    const to = Math.min(Infinity, ...words.filter((c) => c.x0 >= star).map((c) => c.x0));
    const under = rules
      .filter((r) => r.y1 - r.y0 <= 1.2 && line.y - r.y0 >= -1 && line.y - r.y1 <= line.h * 0.45)
      .sort((a, b) => a.x0 - b.x0);
    const joined: [number, number][] = [];
    for (const r of under) {
      const last = joined[joined.length - 1];
      if (last && r.x0 - last[1] < 1.5) last[1] = Math.max(last[1], r.x1);
      else joined.push([r.x0, r.x1]);
    }
    let total = 0;
    let slot = -1;
    // Words may wrap around the blanks (…んです。／＿＿ ★ ＿＿ から。), so only the near sides clip.
    for (let [x0, x1] of joined) {
      x0 = Math.max(x0, from);
      x1 = Math.min(x1, to);
      if (x1 - x0 < line.h * 1.5) continue;
      const n = Math.max(1, Math.round((x1 - x0) / (line.h * BLANK_EMS)));
      if (star >= x0 && star <= x1) slot = total + Math.min(n - 1, Math.floor(((star - x0) / (x1 - x0)) * n));
      total += n;
    }
    if (total !== 4 || slot < 0) continue;
    marks.push({ kind: "star", slot, ...markAt(line, at, at) });
  }
  return marks;
}

/** The stored form of the four blanks: `___ ___ _★_ ___`. */
const blanks = (slot: number) => [0, 1, 2, 3].map((i) => (i === slot ? "_★_" : "___")).join(" ");

/**
 * Write the blanks back where extraction left a lone ★. Works on tagged text too:
 * it replaces only the ★ (and an underline wrapping just it).
 */
export function applyStars(fields: string[], marks: Mark[]): string[] {
  const out = [...fields];
  for (const m of marks) {
    if (m.kind !== "star" || m.slot === undefined) continue;
    const before = squash(m.before).t;
    const after = squash(m.after).t;
    const found: { field: number; nth: number; score: number }[] = [];
    out.forEach((f, field) => {
      const { t } = squash(f.replace(/<[^<>\n]*>/g, ""));
      let nth = 0;
      for (let pos = t.indexOf("★"); pos >= 0; pos = t.indexOf("★", pos + 1), nth += 1) {
        let score = 0;
        while (score < before.length && t[pos - 1 - score] === before[before.length - 1 - score]) score += 1;
        let k = 0;
        while (k < after.length && t[pos + 1 + k] === after[k]) k += 1;
        found.push({ field, nth, score: score + k });
      }
    });
    const best = Math.max(0, ...found.map((f) => f.score));
    const top = found.filter((f) => f.score === best);
    if (best < 1 || top.length !== 1) continue;
    const { field, nth } = top[0];
    let i = -1;
    out[field] = out[field].replace(/[ \t　]*(?:<u>★<\/u>|[_＿]*★[_＿]*)[ \t　]*/g, (hit) => {
      i += 1;
      // Already written out as blanks → leave it.
      return i === nth && !/[_＿]/.test(out[field]) ? ` ${blanks(m.slot!)} ` : hit;
    });
    out[field] = out[field].replace(/^ | $/g, "").replace(/\n | \n/g, "\n");
  }
  return out;
}

/** Text without spaces, in NFKC, remembering where each character came from. */
function squash(s: string): { t: string; at: [number, number][] } {
  let t = "";
  const at: [number, number][] = [];
  let i = 0;
  for (const c of s) {
    const n = c.normalize("NFKC").replace(/\s/g, "");
    for (const x of n) {
      t += x;
      for (let k = 0; k < x.length; k += 1) at.push([i, i + c.length]);
    }
    i += c.length;
  }
  return { t, at };
}

interface Span {
  field: number;
  from: number;
  to: number;
  reading?: string;
}

/**
 * Put the marks back on a block's text fields (plain text in, tagged text out).
 * Each mark goes to the one occurrence whose surroundings match the printed line
 * best; a mark that is ambiguous, or has nothing around it to vouch for it, is
 * dropped rather than guessed.
 */
export function applyMarks(fields: string[], marks: Mark[]): string[] {
  const squashed = fields.map(squash);
  const spans: Span[] = [];
  for (const m of marks) {
    if (m.kind === "star") continue; // see `applyStars`
    const text = squash(m.text).t;
    if (!text) continue;
    const before = squash(m.before).t;
    const after = squash(m.after).t;
    const found: { field: number; pos: number; score: number }[] = [];
    squashed.forEach(({ t }, field) => {
      for (let pos = t.indexOf(text); pos >= 0; pos = t.indexOf(text, pos + 1)) {
        let score = 0;
        while (score < before.length && t[pos - 1 - score] === before[before.length - 1 - score]) score += 1;
        let k = 0;
        while (k < after.length && t[pos + text.length + k] === after[k]) k += 1;
        found.push({ field, pos, score: score + k });
      }
    });
    const best = Math.max(0, ...found.map((f) => f.score));
    const top = found.filter((f) => f.score === best);
    if (top.length !== 1 || (best < 2 && !(found.length === 1 && text.length >= 3))) continue;
    const { field, pos } = top[0];
    const at = squashed[field].at;
    spans.push({ field, from: at[pos][0], to: at[pos + text.length - 1][1], reading: m.reading });
  }
  return applyStars(
    fields.map((s, field) => tag(s, spans.filter((x) => x.field === field))),
    marks,
  );
}

/** Insert the tags: underlines outside, furigana inside, never crossing. */
function tag(s: string, spans: Span[]): string {
  if (spans.length === 0) return s;
  const ruby: Span[] = [];
  for (const r of spans.filter((x) => x.reading).sort((a, b) => a.from - b.from)) {
    if (r.from >= (ruby[ruby.length - 1]?.to ?? 0)) ruby.push(r);
  }
  const under: Span[] = [];
  for (let u of spans.filter((x) => !x.reading).sort((a, b) => a.from - b.from)) {
    // An underline that cuts through a reading's base takes the whole base.
    for (const r of ruby) if (r.from < u.to && r.to > u.from) u = { ...u, from: Math.min(u.from, r.from), to: Math.max(u.to, r.to) };
    const last = under[under.length - 1];
    if (last && u.from <= last.to) last.to = Math.max(last.to, u.to);
    else under.push({ ...u });
  }
  let out = "";
  for (let i = 0; i <= s.length; i += 1) {
    if (ruby.some((r) => r.to === i)) out += "</ruby>";
    if (under.some((u) => u.to === i)) out += "</u>";
    if (under.some((u) => u.from === i)) out += "<u>";
    const r = ruby.find((x) => x.from === i);
    if (r) out += `<ruby=${r.reading}>`;
    out += s[i] ?? "";
  }
  return out;
}

/**
 * Remove the furigana lines an older import left inside the text: on a line of
 * their own, or glued in front of the line they sat above (…ぼ「まね」くには…).
 */
export function stripJunk(s: string, junk: Junk[]): string {
  let out = s;
  for (const j of junk) {
    const text = squash(j.text).t;
    const next = squash(j.next).t;
    if (!text) continue;
    out = out
      .split("\n")
      .filter((line) => squash(line).t !== text)
      .join("\n");
    if (next.length < 4) continue;
    for (;;) {
      const { t, at } = squash(out);
      const pos = t.indexOf(text + next);
      if (pos < 0) break;
      out = out.slice(0, at[pos][0]) + out.slice(at[pos + text.length - 1][1]).replace(/^\n/, "");
    }
  }
  return out;
}

const TAGGED = /<(?:[biu]>|ruby=|size=)/;

/**
 * Bring already-imported (plain) fields up to date: drop the furigana junk, then
 * tag the marks. A field that carries formatting was edited by a person (or already
 * done) and is returned unchanged.
 */
export function enrich(fields: string[], marks: Mark[], junk: Junk[]): string[] {
  const edited = fields.map((f) => TAGGED.test(f));
  const cleaned = fields.map((f, i) => (edited[i] ? f.replace(/<[^<>\n]*>/g, "") : stripJunk(f, junk)));
  const tagged = applyMarks(cleaned, marks);
  // The ★ blanks go into formatted fields too: they replace only the ★ itself.
  return applyStars(
    fields.map((f, i) => (edited[i] ? f : tagged[i])),
    marks,
  );
}

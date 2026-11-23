import { normalizeInstruction } from "../mondai.js";

/**
 * AI structuring of one 問題 block (NP-407 / plan §6 GĐ2).
 *
 * The AI is asked to turn a raw block into a FIXED JSON shape — shared passages
 * (`stimuli`) and questions (`questions`) — but it is NEVER asked to guess the
 * answers. After the AI replies, `validateParsed` checks the output against
 * the raw text of the block: every string the AI produced (prompt, option,
 * passage body) must actually appear in the block. That stops the model from
 * inventing or "fixing" content (plan §11). A block that fails validation
 * becomes a draft with `status: "error"` + the reasons, and the job goes on
 * to the next block — it never fails the whole import.
 */

export interface ParsedStimulus {
  key: string;
  kind: "passage" | "cloze" | "notice" | "pair";
  title?: string;
  body: string;
  bodyB?: string;
  notes?: string;
}

export interface ParsedQuestion {
  /** The printed question number within the block (1-based). */
  no: number;
  prompt: string;
  options: string[];
  /** Which shared passage this question belongs to (the parsed key). */
  stimulusKey?: string;
  /** Position in the passage / cloze blank number. */
  groupOrder?: number;
}

export interface ParsedBlock {
  stimuli: ParsedStimulus[];
  questions: ParsedQuestion[];
}

/** The fixed JSON shape the model must return. Embedded in the prompt verbatim. */
export const PARSED_SCHEMA = `{
  "stimuli": [{ "key": "s1", "kind": "passage", "title": "...", "body": "...", "bodyB": "...", "notes": "..." }],
  "questions": [{ "no": 1, "prompt": "...", "options": ["...", "...", "...", "..."], "stimulusKey": "s1", "groupOrder": 1 }]
}`;

/**
 * The AI prompt for one block. Temperature 0, the raw block in quotes, and a
 * hard rule: output ONLY characters that are already in the block.
 */
export function structurePrompt(block: { instruction: string; rawText: string; mondai?: string | null }): string {
  return [
    "Bạn là người nhập liệu đề thi JLPT. Tách khối 問題 bên dưới thành JSON theo đúng schema.",
    "QUY TẮC CỨNG: chỉ dùng đúng chữ cái có trong khối (không sửa, không bịa, không đoán đáp án).",
    "Bài đọc / đoạn cloze / bảng thông báo dùng chung nhiều câu → đưa vào stimuli (key: s1, s2, …).",
    "Câu nào thuộc bài nào thì đặt stimulusKey đúng key; cloze giữ ký hiệu [1]…[n] trong body.",
    "Mỗi câu: no (số in trong khối, bắt đầu từ 1), prompt (câu hỏi), options (các phương án, theo đúng thứ tự in).",
    "Nếu khối không có bài đọc dùng chung thì stimuli = [].",
    "Trả về CHỈ JSON hợp lệ, không giải thích.",
    "",
    "SCHEMA:",
    PARSED_SCHEMA,
    "",
    "LỜI DẪN 問題:",
    block.instruction,
    block.mondai ? `Dạng chuẩn (tham khảo): ${block.mondai}` : "Dạng chuẩn: chưa nhận dạng được — giữ nguyên nội dung.",
    "",
    "KHỐI GỐC (text đã làm sạch):",
    block.rawText,
  ].join("\n");
}

/**
 * Containment ground truth: the whole block, NFKC-normalised (full/half-width
 * unified, whitespace stripped). A fragment the AI re-joined across lines is
 * still a substring; a fabricated word is not. One normalisation, one
 * `includes` — simpler and stricter than a fragment set, which false-positives
 * when the model re-orders option text that only ever appeared per-line.
 */
export function presentInBlock(rawText: string, s: string): boolean {
  const n = normalizeInstruction(s);
  if (!n) return true; // empty strings are fine
  return normalizeInstruction(rawText).includes(n);
}

export interface ValidationIssue {
  path: string;
  message: string;
}

/**
 * Validate the AI's parsed block. Returns `null` when it is usable, or the
 * list of issues (the caller writes them onto the draft, status `error`).
 */
export function validateParsed(parsed: ParsedBlock | null, rawText: string, expectedOptions: number[] = [4]): ValidationIssue[] {
  if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    return [{ path: "questions", message: "AI không trả được danh sách câu hỏi" }];
  }
  const issues: ValidationIssue[] = [];

  const keys = new Set((parsed.stimuli ?? []).map((s) => s.key));
  for (const st of parsed.stimuli ?? []) {
    if (!st.key) issues.push({ path: `stimuli[]`, message: "thiếu key" });
    if (!["passage", "cloze", "notice", "pair"].includes(st.kind)) {
      issues.push({ path: `stimuli.${st.key}?.kind`, message: `kind không hợp lệ: ${st.kind}` });
    }
    if (st.body && !presentInBlock(rawText, st.body)) {
      issues.push({ path: `stimuli.${st.key}.body`, message: "nội dung không có trong khối gốc — có thể AI bịa" });
    }
    if (st.bodyB && !presentInBlock(rawText, st.bodyB)) {
      issues.push({ path: `stimuli.${st.key}.bodyB`, message: "bài B không có trong khối gốc — có thể AI bịa" });
    }
  }

  const seenNo = new Set<number>();
  parsed.questions.forEach((q, qi) => {
    const at = `questions[${qi}]`;
    if (!Number.isInteger(q.no) || q.no < 1) issues.push({ path: `${at}.no`, message: "số câu phải là số nguyên ≥ 1" });
    else if (seenNo.has(q.no)) issues.push({ path: `${at}.no`, message: `số câu ${q.no} lặp lại` });
    else seenNo.add(q.no);

    if (!q.prompt || !presentInBlock(rawText, q.prompt)) {
      issues.push({ path: `${at}.prompt`, message: q.prompt ? "prompt không có trong khối gốc — có thể AI bịa" : "thiếu prompt" });
    }
    const optCount = q.options?.length ?? 0;
    if (optCount === 0 || !expectedOptions.includes(optCount)) {
      issues.push({ path: `${at}.options`, message: `số phương án ${optCount} không đúng dạng (mong đợi ${expectedOptions.join("/")})` });
    }
    for (const [oi, opt] of (q.options ?? []).entries()) {
      if (!presentInBlock(rawText, opt)) {
        issues.push({ path: `${at}.options[${oi}]`, message: "phương án không có trong khối gốc — có thể AI bịa" });
      }
    }
    if (q.stimulusKey != null && !keys.has(q.stimulusKey)) {
      issues.push({ path: `${at}.stimulusKey`, message: `trỏ bài đọc không tồn tại: ${q.stimulusKey}` });
    }
  });

  // A passage must have at least one question pointing at it — otherwise the
  // generator can never draw it whole.
  for (const st of parsed.stimuli ?? []) {
    if (!parsed.questions.some((q) => q.stimulusKey === st.key)) {
      issues.push({ path: `stimuli.${st.key}`, message: "bài đọc không có câu hỏi nào trỏ tới" });
    }
  }
  return issues;
}

/** Parse + shape-check the AI's JSON reply (never throws on bad JSON). */
export function parseAiJson(raw: string): ParsedBlock | null {
  let s = raw.trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    const o = JSON.parse(s.slice(start, end + 1));
    if (typeof o !== "object" || o === null) return null;
    if (Array.isArray(o.questions)) {
      return {
        stimuli: Array.isArray(o.stimuli) ? o.stimuli : [],
        // The model often writes `"stimulusKey": null` for a standalone
        // question — that means "no passage", not a dangling pointer.
        questions: o.questions.map((q: ParsedBlock["questions"][number]) => {
          if (q && (q as { stimulusKey?: unknown }).stimulusKey === null) {
            const { stimulusKey: _drop, ...rest } = q;
            void _drop;
            return rest;
          }
          return q;
        }),
      };
    }
    return null;
  } catch {
    return null;
  }
}

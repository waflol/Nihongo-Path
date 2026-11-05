"use client";

export interface ExampleInput {
  sentence: string;
  translation: string;
}

export const MAX_EXAMPLES = 10;

const inputClass =
  "block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-focus)]";

/**
 * Repeatable example-sentence inputs for a card: one row per example
 * (Japanese sentence + translation), a "+" button to add another and "×" to
 * remove one. Blank rows are ignored by the server.
 */
export function ExampleFields({
  value,
  onChange,
  autoSuggest = false,
}: {
  value: ExampleInput[];
  onChange: (next: ExampleInput[]) => void;
  /** Adding a card: an empty list gets one suggested sentence on save. */
  autoSuggest?: boolean;
}) {
  const update = (i: number, patch: Partial<ExampleInput>) =>
    onChange(value.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));

  return (
    <fieldset className="sm:col-span-2">
      <legend className="text-sm text-[var(--muted-foreground)]">
        Câu ví dụ (tuỳ chọn{autoSuggest ? " — để trống, hệ thống tự gợi ý 1 câu" : ""})
      </legend>
      <div className="mt-1 space-y-2">
        {value.map((ex, i) => (
          <div
            key={i}
            className="flex items-start gap-2 rounded-lg border border-[var(--border)] bg-[var(--background-1)] p-2"
          >
            <div className="grid flex-1 gap-2 sm:grid-cols-2">
              <input
                value={ex.sentence}
                onChange={(e) => update(i, { sentence: e.target.value })}
                className={inputClass}
                placeholder="猫が好きです。"
                aria-label={`Câu ví dụ ${i + 1} (tiếng Nhật)`}
                lang="ja"
              />
              <input
                value={ex.translation}
                onChange={(e) => update(i, { translation: e.target.value })}
                className={inputClass}
                placeholder="Tôi thích mèo."
                aria-label={`Nghĩa của câu ví dụ ${i + 1}`}
              />
            </div>
            {value.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(value.filter((_, idx) => idx !== i))}
                aria-label={`Xoá ví dụ ${i + 1}`}
                title="Xoá ví dụ"
                className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--border)] text-lg leading-none text-[var(--muted-foreground)] hover:bg-[var(--layer-hover)] hover:text-[#b91c1c]"
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      {value.length < MAX_EXAMPLES && (
        <button
          type="button"
          onClick={() => onChange([...value, { sentence: "", translation: "" }])}
          className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[var(--border)] px-3 py-1.5 text-sm font-medium text-[var(--primary)] hover:bg-[var(--layer-hover)]"
        >
          <span aria-hidden="true" className="text-base leading-none">
            +
          </span>
          Thêm ví dụ
        </button>
      )}
    </fieldset>
  );
}

/** Drop blank rows and trim — the payload sent to the API. */
export function cleanExampleInputs(list: ExampleInput[]) {
  return list
    .map((e) => ({ sentence: e.sentence.trim(), translation: e.translation.trim() }))
    .filter((e) => e.sentence !== "");
}

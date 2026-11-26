"use client";

import { TASK_LABELS, type OrderTask } from "@/lib/ai-benchmark-score";

/** Two families of work; inside "Đọc PDF" the tab only needs to name the kind of file. */
const GROUPS: { name: string; tasks: { id: OrderTask; short?: string }[] }[] = [
  { name: "Học tập", tasks: [{ id: "translate" }, { id: "write" }, { id: "grammar", short: "Ngữ pháp" }, { id: "verify" }] },
  { name: "Đọc file PDF", tasks: [{ id: "ocr-exam", short: "Đề thi" }, { id: "ocr-vocab", short: "Từ vựng" }] },
];

/** Picks which job's priority order is shown. Wraps instead of scrolling, so no tab is ever cut off. */
export function AiTaskTabs({
  value,
  onChange,
  label,
  className = "",
}: {
  value: OrderTask;
  onChange: (t: OrderTask) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={`flex flex-wrap items-end gap-x-6 gap-y-3 ${className}`}>
      {GROUPS.map((g) => (
        <div key={g.name} role="presentation" className="w-full min-w-0 sm:w-auto">
          <p aria-hidden="true" className="mb-1.5 px-1 text-xs text-[var(--muted-foreground)]">{g.name}</p>
          <div role="presentation" className="grid grid-cols-2 gap-1 rounded-xl border border-[var(--border)] bg-[var(--layer)] p-1 sm:flex sm:flex-wrap">
            {g.tasks.map(({ id, short }) => {
              const active = value === id;
              return (
                <button
                  key={id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  aria-label={TASK_LABELS[id]}
                  onClick={() => onChange(id)}
                  className={
                    "min-h-10 whitespace-nowrap rounded-lg px-3.5 text-sm font-medium transition-colors sm:min-h-9 " +
                    (active
                      ? "bg-[var(--primary)] text-[var(--primary-foreground,#fff)] shadow-sm"
                      : "text-[var(--muted-foreground)] hover:bg-[var(--layer-hover)] hover:text-[var(--foreground)]")
                  }
                >
                  {short ?? TASK_LABELS[id]}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

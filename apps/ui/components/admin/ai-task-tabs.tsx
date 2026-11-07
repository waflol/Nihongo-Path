"use client";

import { TASK_LABELS, type BenchTask } from "@/lib/ai-benchmark-score";

const TASKS = ["translate", "write", "grammar", "pronounce"] as const satisfies readonly BenchTask[];

/** Segmented tab strip shared by the priority list and the benchmark panel. */
export function AiTaskTabs({
  value,
  onChange,
  label,
  className = "",
}: {
  value: BenchTask;
  onChange: (t: BenchTask) => void;
  label: string;
  className?: string;
}) {
  return (
    <div role="tablist" aria-label={label} className={`inline-flex rounded-full border border-[var(--border)] p-0.5 ${className}`}>
      {TASKS.map((k) => {
        const active = value === k;
        return (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(k)}
            className={
              "whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium " +
              (active ? "bg-[var(--primary)] text-[var(--primary-foreground,#fff)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]")
            }
          >
            {TASK_LABELS[k]}
          </button>
        );
      })}
    </div>
  );
}

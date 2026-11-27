/** Shapes and helpers shared by the admin exam list and editor. */

export interface AdminSection {
  key: string;
  title?: string;
  timeLimitMin: number | null;
  timeLocked: boolean;
  questionCount: number;
}

export interface AdminExam {
  _id: string;
  title: string;
  description?: string;
  examType?: string;
  year?: number | null;
  level?: string;
  timeLimitMin: number | null;
  shuffle: { questions: boolean; options: boolean };
  status: "DRAFT" | "PUBLISHED";
  questionIds: string[];
  questionCount: number;
  /** Absent on a hand-composed exam. */
  kind?: "full" | "section" | "practice";
  rights?: "own" | "licensed" | "reference";
  /** Present on an exam built from imported files. */
  origin?: { setName: string; sitting: string };
  sections: AdminSection[];
  warnings: string[];
}

export const KIND_LABEL = { full: "Đề đầy đủ", section: "Theo phần", practice: "Luyện tập" } as const;

export const inputClass =
  "block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-focus)]";
export const btn =
  "min-h-9 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)] disabled:cursor-not-allowed disabled:opacity-60";
export const btnPrimary =
  "min-h-9 rounded-lg bg-[var(--primary)] px-4 py-1.5 text-xs font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60";

/** One call to the admin gateway; the API's message when it refuses. */
export async function adminCall<T>(path: string, method = "GET", body?: object): Promise<{ data: T } | { error: string }> {
  const res = await fetch(`/api/admin/exams/${path}`, {
    method,
    cache: "no-store",
    ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
  }).catch(() => null);
  if (!res) return { error: "Không kết nối được máy chủ" };
  const data = (await res.json().catch(() => null)) as (T & { message?: string | string[] }) | null;
  if (res.ok) return { data: data as T };
  if (res.status === 403) return { error: "Tài khoản hiện tại không có quyền quản trị" };
  const m = data?.message;
  return { error: Array.isArray(m) ? m.join("; ") : (m ?? `Lỗi ${res.status}`) };
}

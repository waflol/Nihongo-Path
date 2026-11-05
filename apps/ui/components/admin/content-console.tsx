"use client";

import { useConfirm } from "@/components/learn/use-confirm";
import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";

/**
 * Admin content console (P2-UI-04). One tab per content type (textbooks,
 * units, vocabulary, grammar); each tab has a create/edit form, a list
 * (Preline-style table), and a delete.
 *
 * All calls go through the `/api/admin/content/...` gateway (never the API
 * directly) so the access token stays server-side (P2-UI-05). A 403 from the
 * API (non-admin caller) surfaces as an error banner (T-P2-04).
 */

type ContentKind = "textbooks" | "units" | "vocabulary" | "grammar";

interface Item {
  _id: string;
  createdAt: string;
  // shape varies by kind — we only read the fields the UI shows.
  [key: string]: unknown;
}

const KINDS: { key: ContentKind; label: string; fields: string[] }[] = [
  { key: "textbooks", label: "Giáo trình", fields: ["title", "level", "status"] },
  { key: "units", label: "Đơn vị", fields: ["title", "textbook", "status"] },
  { key: "vocabulary", label: "Từ vựng", fields: ["term", "meaning", "status"] },
  { key: "grammar", label: "Ngữ pháp", fields: ["label", "meaning", "status"] },
];

const inputClass =
  "block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-focus)]";

export function AdminContentConsole() {
  const { confirm, dialog } = useConfirm();
  const [kind, setKind] = useState<ContentKind>("textbooks");
  const [items, setItems] = useState<Item[]>([]);
  // A load has completed for this kind. "Loading" is DERIVED
  // (`loadedFor !== kind`), not a state flag toggled in the effect.
  const [loadedFor, setLoadedFor] = useState<ContentKind | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Bumped after create/delete to re-run the fetch effect.
  const [version, setVersion] = useState(0);

  const spec = KINDS.find((k) => k.key === kind)!;
  const loading = loadedFor !== kind;

  useEffect(() => {
    let cancelled = false;

    (async () => {
      const res = await fetch(
        `/api/admin/content/${kind}?limit=50`,
        { cache: "no-store" },
      ).catch(() => null);
      if (cancelled) return;
      if (!res) {
        setError("Không kết nối được API");
        return;
      }
      if (res.status === 403) {
        setError("Bạn không có quyền quản trị nội dung (403)");
        return;
      }
      if (res.status === 401) {
        setError("Cần đăng nhập để quản trị (401)");
        return;
      }
      const data = (await res.json().catch(() => null)) as
        | { items?: Item[] }
        | null;
      if (cancelled) return;
      setItems(data?.items ?? []);
      setLoadedFor(kind);
      setError(null);
    })();

    return () => {
      cancelled = true;
    };
  }, [kind, version]);

  /** Refetch the list (after create/delete). */
  function refetch() {
    setVersion((v) => v + 1);
  }

  function selectTab(k: ContentKind) {
    // Event handler — synchronous setState is fine here; just don't show the
    // previous tab's rows while the new one loads.
    setKind(k);
    setItems([]);
    setForm({});
    setError(null);
  }

  const editingId = form.__id ?? null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const isUpdate = editingId !== null;
    if (isUpdate && !(await confirm({ title: "Lưu thay đổi?", message: "Nội dung sẽ được cập nhật.", confirmLabel: "Lưu", tone: "primary" }))) return;
    setSaving(true);
    setError(null);

    const res = await fetch(
      isUpdate ? `/api/admin/content/${kind}/${editingId}` : `/api/admin/content/${kind}`,
      {
        method: isUpdate ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cleanForm(form, spec)),
      },
    ).catch(() => null);
    setSaving(false);

    if (!res) {
      setError("Không kết nối được API");
      return;
    }
    if (res.status === 403) {
      setError("Không có quyền (403)");
      return;
    }
    if (res.ok) {
      setForm({});
      refetch();
    } else {
      const data = (await res.json().catch(() => null)) as { message?: string } | null;
      setError(data?.message ? `Lỗi: ${data.message}` : `Thất bại (${res.status})`);
    }
  }

  async function remove(id: string) {
    if (!(await confirm({ title: "Xoá mục này?", message: "Không thể hoàn tác.", confirmLabel: "Xoá" }))) return;
    setDeletingId(id);
    setError(null);
    const res = await fetch(`/api/admin/content/${kind}/${id}`, {
      method: "DELETE",
    }).catch(() => null);
    setDeletingId(null);
    if (res?.ok) {
      refetch();
    } else if (res && res.status === 403) {
      setError("Không có quyền (403)");
    } else {
      setError("Xoá thất bại");
    }
  }

  function startEdit(item: Item) {
    setForm({
      ...pickEditable(item, spec),
      __id: item._id,
    });
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">
          Quản trị nội dung
        </h1>
        <Link
          href="/learn"
          className="text-sm font-medium text-[var(--primary)] hover:text-[var(--primary-hover)]"
        >
          ← Về khu học
        </Link>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-lg bg-[#fef2f2] px-4 py-3 text-sm text-[#b91c1c]"
        >
          {error}
        </p>
      )}

      {/* Tabs */}
      <div className="mt-6 flex flex-wrap gap-1 rounded-xl bg-[var(--background-1)] p-1">
        {KINDS.map((k) => (
          <button
            key={k.key}
            type="button"
            onClick={() => selectTab(k.key)}
            className={
              "rounded-lg px-4 py-2 text-sm font-medium transition-colors " +
              (kind === k.key
                ? "bg-[var(--layer)] text-[var(--foreground)] shadow"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]")
            }
          >
            {k.label}
          </button>
        ))}
      </div>

      {/* Create / edit form */}
      <form
        onSubmit={submit}
        className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5"
      >
        <h2 className="text-sm font-semibold text-[var(--foreground)]">
          {editingId ? "Sửa bản ghi" : `Tạo ${spec.label.toLowerCase()}`}
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {spec.fields
            .filter((f) => f !== "status")
            .map((field) => (
              <label key={field} className="block text-sm">
                <span className="text-[var(--muted-foreground)] capitalize">
                  {humanize(field)}
                </span>
                {field === "textbook" ? (
                  <input
                    value={form.textbookId ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, textbookId: e.target.value }))
                    }
                    className={`mt-1 ${inputClass}`}
                    placeholder="id giáo trình (hex 24 ký tự)"
                  />
                ) : (
                  <input
                    value={form[field] ?? ""}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, [field]: e.target.value }))
                    }
                    className={`mt-1 ${inputClass}`}
                    placeholder={placeholderFor(kind, field)}
                  />
                )}
              </label>
            ))}
          <label className="block text-sm">
            <span className="text-[var(--muted-foreground)]">Trạng thái</span>
            <select
              value={form.status ?? "DRAFT"}
              onChange={(e) =>
                setForm((f) => ({ ...f, status: e.target.value }))
              }
              className={`mt-1 ${inputClass}`}
            >
              <option value="DRAFT">DRAFT (nháp)</option>
              <option value="PUBLISHED">PUBLISHED (công khai)</option>
            </select>
          </label>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:opacity-60"
          >
            {saving
              ? "Đang lưu…"
              : editingId
                ? "Lưu thay đổi"
                : "Tạo mới"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={() => setForm({})}
              className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
            >
              Huỷ sửa
            </button>
          )}
        </div>
      </form>

      {/* List */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-[var(--border)]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--background-1)] text-left text-[var(--muted-foreground)]">
              <tr>
                {spec.fields.map((f) => (
                  <th key={f} className="px-4 py-3 font-medium capitalize">
                    {humanize(f)}
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-medium">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--table-line)]">
              {loading && items.length === 0 && (
                <tr>
                  <td
                    colSpan={spec.fields.length + 1}
                    className="px-4 py-6 text-center text-[var(--muted-foreground)]"
                  >
                    Đang tải…
                  </td>
                </tr>
              )}
              {!loading && items.length === 0 && (
                <tr>
                  <td
                    colSpan={spec.fields.length + 1}
                    className="px-4 py-8 text-center text-[var(--muted-foreground)]"
                  >
                    Chưa có {spec.label.toLowerCase()} nào. Tạo bản đầu tiên
                    phía trên.
                  </td>
                </tr>
              )}
              {items.map((item) => (
                <tr key={item._id} className="hover:bg-[var(--layer-hover)]">
                  {spec.fields.map((f) => (
                    <td key={f} className="px-4 py-3 text-[var(--foreground)]">
                      {cellValue(kind, f, item, form)}
                    </td>
                  ))}
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex gap-2">
                      <button
                        type="button"
                        onClick={() => startEdit(item)}
                        className="rounded-lg border border-[var(--border)] px-3 py-1 text-xs font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
                      >
                        Sửa
                      </button>
                      {deletingId === item._id ? (
                        <span className="text-xs text-[var(--muted-foreground)]">
                          Đang xoá…
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => remove(item._id)}
                          className="rounded-lg border border-[var(--destructive)] px-3 py-1 text-xs font-medium text-[var(--destructive)] hover:bg-[#fef2f2]"
                        >
                          Xoá
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────

function humanize(field: string): string {
  const map: Record<string, string> = {
    title: "Tên",
    level: "Cấp độ",
    status: "Trạng thái",
    term: "Từ",
    meaning: "Nghĩa",
    label: "Nhãn",
    textbook: "Giáo trình",
  };
  return map[field] ?? field;
}

function placeholderFor(kind: ContentKind, field: string): string {
  const map: Record<ContentKind, Record<string, string>> = {
    textbooks: { title: "Tên giáo trình", level: "N5" },
    units: { title: "Tên đơn vị" },
    vocabulary: { term: "進行", meaning: "tiến hành" },
    grammar: { label: "は / が", meaning: "nhấn đề tài" },
  };
  return map[kind][field] ?? "";
}

/** Units reference a textbook by ObjectId via `textbookId` in the DTO; the
 *  table shows the raw `textbook` reference from the document. */
function pickEditable(
  item: Item,
  spec: { fields: string[] },
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of spec.fields) {
    if (f === "status" || f === "textbook") continue;
    const v = f === "textbook" ? (item.textbook as string | undefined) : item[f];
    if (typeof v === "string") out[f === "textbook" ? "textbookId" : f] = v;
  }
  return out;
}

function cleanForm(
  form: Record<string, string>,
  spec: { fields: string[] },
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const f of spec.fields) {
    if (f === "status") continue;
    // The form edits the unit's textbook reference as `textbookId` — that is
    // the key the backend `UnitDto` accepts.
    const key = f === "textbook" ? "textbookId" : f;
    const v = form[key];
    if (typeof v === "string" && v.length > 0) out[key] = v;
  }
  out.status = form.status ?? "DRAFT";
  return out;
}

function cellValue(
  kind: ContentKind,
  field: string,
  item: Item,
  form: Record<string, string>,
): string {
  if (field === "textbook") {
    // Units store the raw ObjectId — show a truncated reference (the form
    // edits it as `textbookId`).
    const ref =
      form.__id === item._id
        ? form.textbookId
        : (item.textbook as string | undefined);
    return ref ? `→ ${ref}` : "—";
  }
  const v = item[field];
  return v == null ? "—" : String(v);
}

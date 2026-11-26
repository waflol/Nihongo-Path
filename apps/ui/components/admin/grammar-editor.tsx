"use client";

import { useEffect, useState, type ReactNode } from "react";
import { GrammarDetail, type GrammarDetailData, type GrammarExample } from "@/components/learn/grammar-detail";
import { useConfirm } from "@/components/learn/use-confirm";
import { BOOKS, CONTEXTS, LEVELS, THEMES, type Category } from "@/lib/grammar-catalog";

type Sense = { label: string; explanation: string; examples: GrammarExample[] };
type Compare = { grammarId?: string; label: string; note?: string };
type BookRef = { textbookId: string; unitId: string; order?: number };

type Doc = GrammarDetailData & {
  status?: string;
  usage?: string;
  pattern?: string;
  groupNo?: number;
  groupJa?: string;
  groupVi?: string;
  textbookRefs?: BookRef[];
  sourceKey?: string;
  sourceProvider?: string;
  editedAt?: string;
};

interface Form {
  label: string;
  meaning: string;
  level: string;
  status: string;
  pattern: string;
  structure: string;
  usage: string;
  coreExplanation: string;
  forms: string;
  explanations: string;
  notes: string;
  senses: Sense[];
  compareWith: Compare[];
  textbookRefs: BookRef[];
  themeIds: string[];
  contextIds: string[];
  groupNo: string;
  groupJa: string;
  groupVi: string;
}

const cleanExample = (e: GrammarExample): GrammarExample => ({ sentence: e.sentence, translation: e.translation, note: e.note ?? "" });

function toForm(doc: Doc): Form {
  // Older records keep examples flat; edit them as a single sense.
  const senses = doc.senses?.length ? doc.senses : doc.examples?.length ? [{ examples: doc.examples }] : [];
  return {
    label: doc.label ?? "",
    meaning: doc.meaning ?? "",
    level: doc.level ?? "",
    status: doc.status ?? "DRAFT",
    pattern: doc.pattern ?? "",
    structure: doc.structure ?? "",
    usage: doc.usage ?? "",
    coreExplanation: doc.coreExplanation ?? "",
    forms: (doc.forms ?? []).join("\n"),
    explanations: (doc.explanations ?? []).join("\n"),
    notes: (doc.notes ?? []).join("\n"),
    senses: senses.map((s: Partial<Sense>) => ({ label: s.label ?? "", explanation: s.explanation ?? "", examples: (s.examples ?? []).map(cleanExample) })),
    compareWith: (doc.compareWith ?? []).map((c) => ({ grammarId: c.grammarId ?? "", label: c.label, note: c.note ?? "" })),
    textbookRefs: (doc.textbookRefs ?? []).map((r) => ({ textbookId: r.textbookId, unitId: r.unitId, order: r.order })),
    themeIds: doc.themeIds ?? [],
    contextIds: doc.contextIds ?? [],
    groupNo: doc.groupNo?.toString() ?? "",
    groupJa: doc.groupJa ?? "",
    groupVi: doc.groupVi ?? "",
  };
}

const lines = (text: string) => text.split("\n").map((l) => l.trim()).filter(Boolean);

/** The PATCH body: only fields the API accepts, with blank rows dropped. */
function toPayload(f: Form) {
  const senses = f.senses.map((s, i) => ({
    no: i + 1,
    label: s.label.trim(),
    explanation: s.explanation.trim(),
    examples: s.examples
      .filter((e) => e.sentence.trim() || e.translation.trim())
      .map((e) => ({ sentence: e.sentence.trim(), translation: e.translation.trim(), note: e.note?.trim() ?? "" })),
  }));
  return {
    label: f.label.trim(),
    meaning: f.meaning.trim(),
    level: f.level,
    status: f.status,
    pattern: f.pattern.trim(),
    structure: f.structure.trim(),
    usage: f.usage.trim(),
    coreExplanation: f.coreExplanation.trim(),
    forms: lines(f.forms),
    explanations: lines(f.explanations),
    notes: lines(f.notes),
    senses,
    examples: senses.flatMap((s) => s.examples),
    compareWith: f.compareWith.filter((c) => c.label.trim()),
    textbookRefs: f.textbookRefs.filter((r) => r.unitId.trim()),
    themeIds: f.themeIds,
    contextIds: f.contextIds,
    ...(f.groupNo ? { groupNo: Number(f.groupNo) } : {}),
    groupJa: f.groupJa.trim(),
    groupVi: f.groupVi.trim(),
  };
}

const input =
  "mt-1 block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] focus:border-[var(--primary)] focus:outline-none";
const ghost = "rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] hover:border-[var(--primary)]";
const remove = "shrink-0 text-xs font-semibold text-[var(--destructive)]";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block text-sm text-[var(--muted-foreground)]">
      {label}
      {hint && <span className="ml-2 text-xs opacity-75">{hint}</span>}
      {children}
    </label>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-3 rounded-2xl border border-[var(--border)] p-4">
      <legend className="px-1 text-sm font-bold text-[var(--primary)]">{title}</legend>
      {children}
    </fieldset>
  );
}

function Chips({ options, value, onChange }: { options: Category[]; value: string[]; onChange: (next: string[]) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== o.id) : [...value, o.id])}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold ${on ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "border border-[var(--border)] text-[var(--muted-foreground)]"}`}
          >
            {o.vi}
          </button>
        );
      })}
    </div>
  );
}

const replace = <T,>(list: T[], index: number, patch: Partial<T>) => list.map((x, i) => (i === index ? { ...x, ...patch } : x));
const without = <T,>(list: T[], index: number) => list.filter((_, i) => i !== index);

/** Full admin editor of one grammar point, with a live learner preview. */
export function GrammarEditor({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: () => void }) {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [preview, setPreview] = useState(false);
  const { confirm, dialog } = useConfirm();

  useEffect(() => {
    let alive = true;
    void fetch(`/api/admin/content/grammar/${id}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<Doc>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => {
        if (!alive) return;
        setDoc(d);
        setForm(toForm(d));
      })
      .catch(() => alive && setError("Không tải được bản ghi."));
    return () => {
      alive = false;
    };
  }, [id]);

  if (!form || !doc) {
    return <p className="p-4 text-sm text-[var(--muted-foreground)]">{error || "Đang tải…"}</p>;
  }

  const set = (patch: Partial<Form>) => setForm({ ...form, ...patch });
  const text = (key: "label" | "meaning" | "pattern" | "structure" | "groupJa" | "groupVi") => (
    <input value={form[key]} onChange={(e) => set({ [key]: e.target.value })} className={input} />
  );
  const area = (key: "usage" | "coreExplanation" | "forms" | "explanations" | "notes", rows: number) => (
    <textarea rows={rows} value={form[key]} onChange={(e) => set({ [key]: e.target.value })} className={`${input} leading-6`} />
  );
  const setSense = (i: number, patch: Partial<Sense>) => set({ senses: replace(form.senses, i, patch) });

  async function save() {
    if (!form) return;
    const body = toPayload(form);
    if (!body.label || !body.meaning) return setError("Mẫu và nghĩa không được để trống.");
    if (body.examples.some((e) => !e.sentence || !e.translation)) return setError("Mỗi ví dụ cần cả câu tiếng Nhật và bản dịch.");
    if (!(await confirm({ title: "Lưu thay đổi?", message: "Bản ghi sẽ được cập nhật và không bị import ghi đè nữa.", confirmLabel: "Lưu", tone: "primary" }))) return;
    setSaving(true);
    setError("");
    const r = await fetch(`/api/admin/content/grammar/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    setSaving(false);
    if (r?.ok) return onSaved();
    const data = (await r?.json().catch(() => null)) as { message?: string | string[] } | null;
    setError(`Lưu thất bại: ${[data?.message ?? r?.status ?? "mất mạng"].flat().join("; ")}`);
  }

  return (
    <div className="space-y-4 text-left">
      {dialog}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-[var(--muted-foreground)]">
          {doc.sourceProvider ? `Nguồn ${doc.sourceProvider} · ${doc.sourceKey}` : "Tạo thủ công"}
          {doc.editedAt ? ` · đã sửa ${new Date(doc.editedAt).toLocaleString("vi-VN")}` : ""}
        </p>
        <div className="flex gap-2">
          <button type="button" aria-pressed={preview} onClick={() => setPreview(!preview)} className={ghost}>{preview ? "Quay lại form" : "Xem trước"}</button>
          <button type="button" onClick={onClose} className={ghost}>Đóng</button>
        </div>
      </div>

      {preview ? (
        <article className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5">
          <GrammarDetail item={{ _id: id, ...toPayload(form) }} />
        </article>
      ) : (
        <>
          <p className="text-xs text-[var(--muted-foreground)]">Furigana viết dạng 漢字[かんじ]; mẫu cần tô đậm đặt trong {"{…}"}.</p>
          <Group title="Thông tin chính">
            <Field label="Mẫu ngữ pháp">{text("label")}</Field>
            <Field label="Nghĩa">{text("meaning")}</Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Cấp độ">
                <select value={form.level} onChange={(e) => set({ level: e.target.value })} className={input}>
                  <option value="">—</option>
                  {LEVELS.map((l) => <option key={l.id}>{l.id}</option>)}
                </select>
              </Field>
              <Field label="Trạng thái">
                <select value={form.status} onChange={(e) => set({ status: e.target.value })} className={input}>
                  <option value="DRAFT">Bản nháp</option>
                  <option value="PUBLISHED">Publish</option>
                </select>
              </Field>
              <Field label="Pattern" hint="dùng để tìm kiếm">{text("pattern")}</Field>
              <Field label="Cấu trúc ngắn">{text("structure")}</Field>
            </div>
          </Group>

          <Group title="Giải thích">
            <Field label="Ý cốt lõi">{area("coreExplanation", 2)}</Field>
            <Field label="Cách ghép" hint="mỗi dòng một công thức">{area("forms", 4)}</Field>
            <Field label="Giải thích chi tiết" hint="mỗi dòng một đoạn">{area("explanations", 5)}</Field>
            <Field label="Lưu ý" hint="mỗi dòng một ý">{area("notes", 3)}</Field>
            <Field label="Cách dùng">{area("usage", 2)}</Field>
          </Group>

          <Group title="Nghĩa và ví dụ">
            {form.senses.map((sense, i) => (
              <div key={i} className="space-y-2 rounded-xl bg-[var(--background-1)] p-3">
                <div className="flex items-center justify-between">
                  <strong className="text-sm text-[var(--foreground)]">Nghĩa {i + 1}</strong>
                  <button type="button" onClick={() => set({ senses: without(form.senses, i) })} className={remove}>Xoá nghĩa</button>
                </div>
                <Field label="Tên nghĩa"><input value={sense.label} onChange={(e) => setSense(i, { label: e.target.value })} className={input} /></Field>
                <Field label="Giải thích"><textarea rows={2} value={sense.explanation} onChange={(e) => setSense(i, { explanation: e.target.value })} className={input} /></Field>
                {sense.examples.map((example, j) => {
                  const change = (patch: Partial<GrammarExample>) => setSense(i, { examples: replace(sense.examples, j, patch) });
                  return (
                    <div key={j} className="space-y-1 rounded-lg border border-[var(--border)] p-3">
                      <div className="flex items-center justify-between text-xs text-[var(--muted-foreground)]">
                        <span>Ví dụ {j + 1}</span>
                        <button type="button" onClick={() => setSense(i, { examples: without(sense.examples, j) })} className={remove}>Xoá</button>
                      </div>
                      <input aria-label={`Câu tiếng Nhật, nghĩa ${i + 1} ví dụ ${j + 1}`} placeholder="Câu tiếng Nhật" value={example.sentence} onChange={(e) => change({ sentence: e.target.value })} className={input} />
                      <input aria-label={`Bản dịch, nghĩa ${i + 1} ví dụ ${j + 1}`} placeholder="Bản dịch" value={example.translation} onChange={(e) => change({ translation: e.target.value })} className={input} />
                      <input aria-label={`Ghi chú, nghĩa ${i + 1} ví dụ ${j + 1}`} placeholder="Ghi chú (tuỳ chọn)" value={example.note ?? ""} onChange={(e) => change({ note: e.target.value })} className={input} />
                    </div>
                  );
                })}
                <button type="button" onClick={() => setSense(i, { examples: [...sense.examples, { sentence: "", translation: "", note: "" }] })} className={ghost}>+ Thêm ví dụ</button>
              </div>
            ))}
            <button type="button" onClick={() => set({ senses: [...form.senses, { label: "", explanation: "", examples: [] }] })} className={ghost}>+ Thêm nghĩa</button>
          </Group>

          <Group title="Mẫu dễ nhầm">
            {form.compareWith.map((c, i) => (
              <div key={i} className="space-y-1 rounded-xl bg-[var(--background-1)] p-3">
                <div className="flex items-center gap-2">
                  <input aria-label={`Mẫu so sánh ${i + 1}`} placeholder="Mẫu" value={c.label} onChange={(e) => set({ compareWith: replace(form.compareWith, i, { label: e.target.value }) })} className={input} />
                  <button type="button" onClick={() => set({ compareWith: without(form.compareWith, i) })} className={remove}>Xoá</button>
                </div>
                <textarea aria-label={`Điểm khác nhau ${i + 1}`} placeholder="Khác nhau ở đâu" rows={2} value={c.note ?? ""} onChange={(e) => set({ compareWith: replace(form.compareWith, i, { note: e.target.value }) })} className={input} />
              </div>
            ))}
            <button type="button" onClick={() => set({ compareWith: [...form.compareWith, { label: "", note: "" }] })} className={ghost}>+ Thêm mẫu so sánh</button>
          </Group>

          <Group title="Phân loại">
            <p className="text-sm text-[var(--muted-foreground)]">Chủ đề</p>
            <Chips options={THEMES} value={form.themeIds} onChange={(themeIds) => set({ themeIds })} />
            <p className="text-sm text-[var(--muted-foreground)]">Bối cảnh</p>
            <Chips options={CONTEXTS} value={form.contextIds} onChange={(contextIds) => set({ contextIds })} />
            <div className="grid gap-3 sm:grid-cols-[6rem_1fr_1fr]">
              <Field label="Nhóm số"><input type="number" min={0} value={form.groupNo} onChange={(e) => set({ groupNo: e.target.value })} className={input} /></Field>
              <Field label="Tên nhóm (Việt)">{text("groupVi")}</Field>
              <Field label="Tên nhóm (Nhật)">{text("groupJa")}</Field>
            </div>
            <p className="text-sm text-[var(--muted-foreground)]">Giáo trình</p>
            {form.textbookRefs.map((ref, i) => (
              <div key={i} className="flex flex-wrap items-end gap-2">
                <Field label="Sách">
                  <select value={ref.textbookId} onChange={(e) => set({ textbookRefs: replace(form.textbookRefs, i, { textbookId: e.target.value }) })} className={input}>
                    {BOOKS.map((b) => <option key={b.id} value={b.id}>{b.vi}</option>)}
                  </select>
                </Field>
                <Field label="Bài"><input value={ref.unitId} onChange={(e) => set({ textbookRefs: replace(form.textbookRefs, i, { unitId: e.target.value }) })} className={`${input} w-24`} /></Field>
                <Field label="Thứ tự"><input type="number" min={0} value={ref.order ?? ""} onChange={(e) => set({ textbookRefs: replace(form.textbookRefs, i, { order: e.target.value === "" ? undefined : Number(e.target.value) }) })} className={`${input} w-24`} /></Field>
                <button type="button" onClick={() => set({ textbookRefs: without(form.textbookRefs, i) })} className={`${remove} pb-3`}>Xoá</button>
              </div>
            ))}
            <button type="button" onClick={() => set({ textbookRefs: [...form.textbookRefs, { textbookId: BOOKS[0].id, unitId: "" }] })} className={ghost}>+ Thêm bài giáo trình</button>
          </Group>
        </>
      )}

      {error && <p role="alert" className="rounded-lg border border-[var(--destructive)] px-4 py-3 text-sm text-[var(--destructive)]">{error}</p>}
      <div className="sticky bottom-0 flex gap-2 border-t border-[var(--border)] bg-[var(--background)] py-3">
        <button type="button" disabled={saving} onClick={() => void save()} className="rounded-lg bg-[var(--primary)] px-5 py-2.5 text-sm font-semibold text-[var(--primary-foreground)] disabled:opacity-60">{saving ? "Đang lưu…" : "Lưu thay đổi"}</button>
        <button type="button" onClick={onClose} className={ghost}>Huỷ</button>
      </div>
    </div>
  );
}

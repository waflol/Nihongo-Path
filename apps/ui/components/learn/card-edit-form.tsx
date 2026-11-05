"use client";

import { useConfirm } from "@/components/learn/use-confirm";
import { useState, type FormEvent } from "react";
import { ImageField } from "@/components/learn/image-field";
import { ReadingFields, type PartOfSpeech } from "@/components/learn/reading-fields";
import {
  ExampleFields,
  cleanExampleInputs,
  type ExampleInput,
} from "@/components/learn/example-fields";

export interface EditableCard {
  _id: string;
  front: string;
  back: string;
  reading?: string;
  image?: string;
  imageCredit?: string;
  partOfSpeech?: string;
  examples?: { sentence: string; translation?: string }[];
  tags?: string[];
}

const inputClass =
  "block w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus:border-[var(--primary-focus)] focus:outline-none focus:ring-1 focus:ring-[var(--primary-focus)]";

/**
 * Inline editor for one card (front / back / examples / tags). Saves through
 * `PATCH /api/flashcards/cards/:id`; the parent reloads the list on success.
 */
export function CardEditForm({
  card,
  onSaved,
  onCancel,
  onError,
}: {
  card: EditableCard;
  onSaved: () => void | Promise<void>;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const { confirm, dialog } = useConfirm();
  const [front, setFront] = useState(card.front);
  const [back, setBack] = useState(card.back);
  const [image, setImage] = useState(card.image ?? "");
  const [imageCredit, setImageCredit] = useState(card.imageCredit ?? "");
  const [reading, setReading] = useState(card.reading ?? "");
  const [partOfSpeech, setPartOfSpeech] = useState<PartOfSpeech | "">(
    card.partOfSpeech === "verb" || card.partOfSpeech === "noun" || card.partOfSpeech === "adjective"
      ? card.partOfSpeech
      : "",
  );
  const [examples, setExamples] = useState<ExampleInput[]>(
    card.examples && card.examples.length > 0
      ? card.examples.map((e) => ({ sentence: e.sentence, translation: e.translation ?? "" }))
      : [{ sentence: "", translation: "" }],
  );
  const [tags, setTags] = useState((card.tags ?? []).join(", "));
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!(await confirm({ title: "Lưu thay đổi thẻ?", message: "Thẻ sẽ được cập nhật.", confirmLabel: "Lưu", tone: "primary" }))) return;
    setSaving(true);
    const res = await fetch(`/api/flashcards/cards/${card._id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        front: front.trim(),
        back: back.trim(),
        reading: reading.trim(),
        image,
        imageCredit,
        partOfSpeech,
        examples: cleanExampleInputs(examples),
        tags: tags.split(/[;,]/).map((t) => t.trim()).filter(Boolean),
      }),
    }).catch(() => null);
    setSaving(false);
    if (res?.ok) {
      await onSaved();
    } else if (res?.status === 409) {
      onError("Đã có thẻ giống hệt trong bộ này");
    } else {
      onError("Lưu thẻ thất bại");
    }
  }

  return (
    <form onSubmit={submit} className="w-full">
      {dialog}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="text-[var(--muted-foreground)]">Mặt trước (câu hỏi)</span>
          <input
            required
            value={front}
            onChange={(e) => setFront(e.target.value)}
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <label className="block text-sm">
          <span className="text-[var(--muted-foreground)]">Mặt sau (đáp án)</span>
          <input
            required
            value={back}
            onChange={(e) => setBack(e.target.value)}
            className={`mt-1 ${inputClass}`}
          />
        </label>
        <ReadingFields
          front={front}
          reading={reading}
          partOfSpeech={partOfSpeech}
          onReading={setReading}
          onPartOfSpeech={setPartOfSpeech}
          autoOnMount={false}
        />
        <ImageField
          term={front}
          image={image}
          credit={imageCredit}
          onChange={(img, credit) => {
            setImage(img);
            setImageCredit(credit);
          }}
        />
        <ExampleFields value={examples} onChange={setExamples} />
        <label className="block text-sm sm:col-span-2">
          <span className="text-[var(--muted-foreground)]">
            Tags (tuỳ chọn, phân tách bằng dấu phẩy)
          </span>
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            className={`mt-1 ${inputClass}`}
          />
        </label>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="submit"
          disabled={saving || front.trim() === "" || back.trim() === ""}
          className="rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Đang lưu…" : "Lưu"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-[var(--border)] px-4 py-2 text-sm font-medium text-[var(--foreground)] hover:bg-[var(--layer-hover)]"
        >
          Huỷ
        </button>
      </div>
    </form>
  );
}

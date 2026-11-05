"use client";

import CountUp from "@/components/reactbits/CountUp";

import Link from "next/link";
import { useEffect, useState } from "react";

interface SharedDeck {
  _id: string;
  title: string;
  cardCount: number;
  status: string;
}

/** Admin landing: live numbers about the shared decks + the main actions. */
export function AdminOverview() {
  const [decks, setDecks] = useState<SharedDeck[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await fetch("/api/flashcards/admin/decks", { cache: "no-store" }).catch(() => null);
      const all = res?.ok ? ((await res.json().catch(() => [])) as SharedDeck[]) : [];
      if (!cancelled) setDecks(Array.isArray(all) ? all : []);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const totalCards = decks?.reduce((n, d) => n + d.cardCount, 0) ?? 0;
  const published = decks?.filter((d) => d.status === "PUBLISHED").length ?? 0;

  const stats = [
    { label: "Bộ thẻ chung", value: decks ? decks.length : "—" },
    { label: "Đã xuất bản", value: decks ? published : "—" },
    { label: "Tổng số thẻ", value: decks ? totalCards : "—" },
  ];

  const actions = [
    {
      href: "/admin/decks",
      title: "Tạo bộ thẻ chung",
      desc: "Tạo bộ mới, thêm thẻ bằng tay (hiragana, từ loại, ví dụ, ảnh).",
    },
    {
      href: "/admin/import",
      title: "Nhập thẻ từ CSV / XLSX",
      desc: "Tải file lên, ánh xạ cột, xem trước, phát hiện trùng rồi xác nhận.",
    },
    {
      href: "/admin/content",
      title: "Quản lý nội dung học",
      desc: "Giáo trình, đơn vị, từ vựng và ngữ pháp.",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-8 sm:px-6">
      <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)]">Tổng quan</h1>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Quản lý nội dung dùng chung cho tất cả người học.
      </p>

      <dl className="mt-6 grid gap-3 sm:grid-cols-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5">
            <dt className="text-xs font-medium uppercase tracking-wide text-[var(--muted-foreground)]">{s.label}</dt>
            <dd className="mt-1 text-3xl font-bold tabular-nums text-[var(--foreground)]">{typeof s.value === "number" ? <CountUp to={s.value} duration={1.2} separator="," /> : s.value}</dd>
          </div>
        ))}
      </dl>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
        Việc thường làm
      </h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {actions.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="group rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-5 transition hover:border-[var(--primary)] hover:bg-[var(--layer-hover)]"
          >
            <h3 className="text-sm font-semibold text-[var(--foreground)]">
              {a.title} <span aria-hidden="true" className="inline-block transition-transform group-hover:translate-x-0.5">→</span>
            </h3>
            <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">{a.desc}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}

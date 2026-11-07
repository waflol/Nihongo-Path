"use client";

import { useState } from "react";

export interface ImportErrorInfo {
  rowNumber: number;
  no?: number;
  front?: string;
  back?: string;
  error: string;
}

function reason(e: string): string {
  return e === "front and back are required" ? "thiếu từ hoặc nghĩa" : e;
}

/** Table of the rows an import rejected (not added to the deck), with why. */
export function ErrorsPanel({ errors, defaultOpen = false }: { errors: ImportErrorInfo[]; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  if (errors.length === 0) return null;
  return (
    <section className="mt-4 rounded-xl border border-[#fecaca] bg-[var(--background)]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-sm font-medium text-[#b91c1c]"
      >
        <span>
          {open ? "▾" : "▸"} Xem {errors.length} dòng lỗi (không được thêm vào bộ thẻ)
        </span>
      </button>
      {open && (
        <div className="overflow-auto border-t border-[#fecaca]">
          <table className="min-w-full text-sm">
            <thead className="bg-[var(--layer)] text-left text-xs text-[var(--muted-foreground)]">
              <tr>
                <th className="px-3 py-2 font-medium">STT</th>
                <th className="px-3 py-2 font-medium">Dòng</th>
                <th className="px-3 py-2 font-medium">Từ</th>
                <th className="px-3 py-2 font-medium">Nghĩa</th>
                <th className="px-3 py-2 font-medium">Lý do</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border)] text-[var(--foreground)]">
              {errors.map((e) => (
                <tr key={e.rowNumber}>
                  <td className="px-3 py-2">{e.no ?? "—"}</td>
                  <td className="px-3 py-2">{e.rowNumber}</td>
                  <td className="px-3 py-2">{e.front || <span className="text-[#b91c1c]">(trống)</span>}</td>
                  <td className="px-3 py-2">{e.back || <span className="text-[#b91c1c]">(trống)</span>}</td>
                  <td className="px-3 py-2 text-[#b91c1c]">{reason(e.error)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

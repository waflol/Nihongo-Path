"use client";

import { useId, useState, type KeyboardEvent } from "react";

export interface TextbookOption {
  _id: string;
  title: string;
  level?: string;
}

export const textbookLabel = (t: TextbookOption) => (t.level ? `${t.title} (${t.level})` : t.title);

/** Lower case without Vietnamese accents, so "giao trinh" finds "Giáo trình". */
const fold = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/gi, "d").toLowerCase();

/** Searchable single select over the existing textbooks; the value is the textbook id. */
export function TextbookSelect({
  id,
  value,
  options,
  onChange,
  className,
}: {
  id: string;
  value: string;
  /** `null` while the list is loading. */
  options: TextbookOption[] | null;
  onChange: (id: string) => void;
  className: string;
}) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const selected = options?.find((o) => o._id === value);
  const needle = fold(query.trim());
  const matches = (options ?? []).filter((o) => fold(textbookLabel(o)).includes(needle));

  function show() {
    if (open) return;
    setQuery("");
    setActive(Math.max(0, options?.findIndex((o) => o._id === value) ?? 0));
    setOpen(true);
  }

  function pick(option: TextbookOption) {
    onChange(option._id);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    // Keys that belong to a Japanese / Vietnamese input method are left to it.
    if (e.nativeEvent.isComposing) return;
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) return show();
      const step = e.key === "ArrowDown" ? 1 : -1;
      const next = Math.min(matches.length - 1, Math.max(0, active + step));
      setActive(next);
      document.getElementById(`${listId}-${next}`)?.scrollIntoView({ block: "nearest" });
    } else if (e.key === "Enter" && open) {
      // Choose the option instead of submitting the form.
      e.preventDefault();
      if (matches[active]) pick(matches[active]);
    } else if (e.key === "Escape" && open) {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={open && matches[active] ? `${listId}-${active}` : undefined}
        autoComplete="off"
        value={open ? query : selected ? textbookLabel(selected) : value}
        placeholder={
          options === null
            ? "Đang tải giáo trình…"
            : open && selected
              ? textbookLabel(selected)
              : "Tìm và chọn giáo trình"
        }
        onFocus={show}
        onClick={show}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        className={`${className} pr-8`}
      />
      <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--muted-foreground)]">
        ▾
      </span>
      {open && options !== null && (
        <ul
          id={listId}
          role="listbox"
          // Keep the input focused while clicking or dragging the list.
          onMouseDown={(e) => e.preventDefault()}
          className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-[var(--border)] bg-[var(--background)] py-1 shadow-lg"
        >
          {matches.map((o, i) => (
            <li
              key={o._id}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o._id === value}
              onClick={() => pick(o)}
              onMouseMove={() => setActive(i)}
              className={
                "cursor-pointer px-3 py-2 text-sm text-[var(--foreground)] " +
                (i === active ? "bg-[var(--layer-hover)] " : "") +
                (o._id === value ? "font-semibold" : "")
              }
            >
              {textbookLabel(o)}
            </li>
          ))}
          {matches.length === 0 && (
            <li className="px-3 py-2 text-sm text-[var(--muted-foreground)]">
              {options.length === 0 ? "Chưa có giáo trình nào." : "Không tìm thấy giáo trình."}
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

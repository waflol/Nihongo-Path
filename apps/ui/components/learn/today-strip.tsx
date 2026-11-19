"use client";

import { useEffect, useState } from "react";
import { fetchShared } from "@/lib/inflight-fetch";

interface Today {
  streak: number;
  newToday: number;
  newPerDay: number;
  reviews: number;
}

function greeting(h: number): string {
  if (h < 5) return "Khuya rồi";
  if (h < 11) return "Chào buổi sáng";
  if (h < 14) return "Chào buổi trưa";
  if (h < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

/** Greeting + today's goal. Renders a neutral line until data arrives, so the layout never jumps. */
export function TodayStrip() {
  const [name, setName] = useState<string | null>(null);
  const [today, setToday] = useState<Today | null>(null);
  const [hour, setHour] = useState<number | null>(null);

  useEffect(() => {
    setHour(new Date().getHours());
    fetchShared("/api/auth/session")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const email: string | undefined = d?.user?.email;
        const n: string | undefined = d?.user?.name ?? (email ? email.split("@")[0] : undefined);
        if (n) setName(n);
      })
      .catch(() => {});
    fetchShared("/api/srs/stats?range=all&offset=0", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => {
        if (!s) return;
        setToday({
          streak: s.overview?.streak ?? 0,
          newToday: s.newToday ?? 0,
          newPerDay: s.newPerDay ?? 0,
          reviews: s.reviewsInRange ?? 0,
        });
      })
      .catch(() => {});
  }, []);

  const goal = today && today.newPerDay > 0 ? Math.min(1, today.newToday / today.newPerDay) : 0;
  const done = today ? today.newPerDay > 0 && today.newToday >= today.newPerDay : false;

  return (
    <div className="min-w-0">
      <h1 className="truncate text-lg font-semibold leading-none sm:text-xl tracking-tight text-[var(--foreground)] lg:text-2xl">
        {hour === null ? "Khu học tập" : `${greeting(hour)}${name ? `, ${name}` : ""}`}
      </h1>
      <div className="mt-1.5 flex min-w-0 items-center gap-3 text-xs text-[var(--muted-foreground)] sm:text-sm">
        {today ? (
          <>
            <span className="inline-flex shrink-0 items-center gap-1.5">
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-14 overflow-hidden rounded-full bg-[var(--border)] sm:w-20"
              >
                <span
                  className="block h-full rounded-full bg-[var(--primary)] transition-[width] duration-700"
                  style={{ width: `${goal * 100}%` }}
                />
              </span>
              <span className="tabular-nums">
                {today.newToday}/{today.newPerDay} từ mới
              </span>
              {done && <span className="font-medium text-[var(--primary)]">Đủ mục tiêu</span>}
            </span>
            {today.streak > 0 && (
              <span className="shrink-0 tabular-nums">
                Chuỗi <strong className="font-semibold text-[var(--foreground)]">{today.streak}</strong> ngày
              </span>
            )}
          </>
        ) : (
          <span>Chọn một hoạt động để bắt đầu.</span>
        )}
      </div>
    </div>
  );
}

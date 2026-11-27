"use client";

import { useEffect, useState } from "react";
import { fetchShared } from "@/lib/inflight-fetch";

function greeting(h: number): string {
  if (h < 5) return "Khuya rồi";
  if (h < 11) return "Chào buổi sáng";
  if (h < 14) return "Chào buổi trưa";
  if (h < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}

/** Greeting + study streak. */
export function TodayStrip() {
  const [name, setName] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
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
        setStreak(s?.overview?.streak ?? 0);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-w-0">
      <h1 className="truncate text-lg font-semibold leading-none sm:text-xl tracking-tight text-[var(--foreground)] lg:text-2xl">
        {hour === null ? "Khu học tập" : `${greeting(hour)}${name ? `, ${name}` : ""}`}
      </h1>
      {streak > 0 && (
        <p className="mt-1.5 text-xs tabular-nums text-[var(--muted-foreground)] sm:text-sm">
          Chuỗi <strong className="font-semibold text-[var(--foreground)]">{streak}</strong> ngày
        </p>
      )}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";

interface Remaining {
  gated: boolean;
  used: number;
  limit: number | null;
  remaining: number | null;
}

/**
 * Learner quota readout (P5-QUOTA, §6.2 "Hiển thị: X lượt parse câu còn trong
 * kỳ này"). Fetches `/api/entitlements/me/remaining/:featureKey`; renders
 * nothing when the feature is ungated (no config row) or the caller is
 * unlimited — so it stays invisible until the operator turns a limit on.
 * Callers may bump `nonce` to re-fetch after consuming a slot.
 */
export function QuotaNote({ featureKey, nonce = 0 }: { featureKey: string; nonce?: number }) {
  const [data, setData] = useState<Remaining | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/entitlements/me/remaining/${encodeURIComponent(featureKey)}`, {
      cache: "no-store",
    }).catch(() => null);
    if (!res?.ok) return;
    const d = (await res.json().catch(() => null)) as Remaining | null;
    if (d?.gated) setData(d);
  }, [featureKey]);

  useEffect(() => {
    void load();
  }, [load, nonce]);

  if (!data || data.remaining === null) return null;
  const low = data.remaining <= 2;
  return (
    <p
      className={
        "text-xs " +
        (data.remaining === 0
          ? "text-[#b91c1c]"
          : low
            ? "text-[#b45309]"
            : "text-[var(--muted-foreground)]")
      }
    >
      {data.remaining === 0
        ? "Bạn đã dùng hết lượt chấm câu AI trong kỳ này."
        : `Bạn còn ${data.remaining} lượt chấm câu AI trong kỳ này.`}
    </p>
  );
}

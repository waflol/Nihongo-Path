"use client";

import { useEffect, useState } from "react";
import {
  canPromptInstall,
  isIos,
  isStandalone,
  justInstalled,
  promptInstall,
  subscribeInstall,
} from "@/lib/pwa-install";

type Mode = "hidden" | "installed" | "prompt" | "ios" | "manual";

function currentMode(): Mode {
  if (isStandalone() || justInstalled()) return "installed";
  if (canPromptInstall()) return "prompt";
  if (isIos()) return "ios";
  return "manual";
}

/**
 * "Cài ứng dụng" card (docs/plans/plan-pwa.md, P1).
 * - Chrome/Edge (Android, desktop): a real install button.
 * - iOS: Safari has no install API, so show the Share → Add to Home Screen steps.
 * - Already running as the installed app: render nothing.
 */
export function InstallAppCard() {
  // Starts hidden so the server render and first client render match.
  const [mode, setMode] = useState<Mode>("hidden");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const update = () => setMode(currentMode());
    update();
    return subscribeInstall(update);
  }, []);

  if (mode === "hidden" || mode === "installed") return null;

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-6">
      <div className="flex items-start gap-4">
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny static icon */}
        <img src="/icons/icon-192.png" alt="" width={48} height={48} className="shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Cài Nihongo Path lên điện thoại</h2>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">
            Mở nhanh từ màn hình chính, toàn màn hình như một ứng dụng. Miễn phí, không cần vào cửa hàng ứng dụng.
          </p>

          {mode === "prompt" && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await promptInstall();
                } finally {
                  setBusy(false);
                  setMode(currentMode());
                }
              }}
              className="mt-4 min-h-11 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cài ứng dụng
            </button>
          )}

          {mode === "ios" && (
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm text-[var(--foreground)]">
              <li>Mở trang này bằng <strong>Safari</strong>.</li>
              <li>
                Bấm nút <strong>Chia sẻ</strong> (ô vuông có mũi tên lên) ở thanh dưới.
              </li>
              <li>
                Chọn <strong>Thêm vào MH chính</strong>, rồi bấm <strong>Thêm</strong>.
              </li>
            </ol>
          )}

          {mode === "manual" && (
            <p className="mt-3 text-sm text-[var(--foreground)]">
              Trên Android, mở trang bằng <strong>Chrome</strong> → menu <strong>⋮</strong> →{" "}
              <strong>Cài đặt ứng dụng</strong> (hoặc <strong>Thêm vào MH chính</strong>).
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

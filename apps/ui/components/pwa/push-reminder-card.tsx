"use client";

import { useEffect, useState } from "react";
import { isIos, isStandalone } from "@/lib/pwa-install";

/**
 * Daily review reminder via Web Push (docs/plans/plan-pwa.md, P2).
 * Off by default: permission is only requested when the learner turns it on.
 * One subscription per browser/device; the server keeps the hour + zone.
 */

type Status =
  | { kind: "loading" }
  | { kind: "unsupported"; reason: "ios-browser" | "browser" }
  | { kind: "server-off" }
  | { kind: "denied" }
  | { kind: "off" }
  | { kind: "on"; hour: number };

const BASE = "/api/notifications/push";
const HOURS = Array.from({ length: 18 }, (_, i) => i + 6); // 06:00 … 23:00
const DEFAULT_HOUR = 20;

/** VAPID key (base64url) → bytes for PushManager.subscribe(). */
function keyToBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function swRegistration(): Promise<ServiceWorkerRegistration | null> {
  // `ready` never resolves without a SW (e.g. NEXT_PUBLIC_PWA=off) — cap the wait.
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise<null>((r) => setTimeout(() => r(null), 8000)),
  ]);
}

async function errorText(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { message?: string | string[]; error?: string };
    const m = Array.isArray(body.message) ? body.message[0] : body.message;
    return m ?? body.error ?? `Lỗi ${res.status}`;
  } catch {
    return `Lỗi ${res.status}`;
  }
}

/** Where this browser stands: support, server, permission, subscription. */
async function readStatus(): Promise<Status> {
  const supported =
    "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  if (!supported) {
    // iOS only exposes Web Push to home-screen apps (iOS 16.4+).
    return { kind: "unsupported", reason: isIos() && !isStandalone() ? "ios-browser" : "browser" };
  }
  const keyRes = await fetch(`${BASE}/public-key`, { cache: "no-store" });
  if (keyRes.status === 404) return { kind: "server-off" };
  if (Notification.permission === "denied") return { kind: "denied" };
  const reg = await swRegistration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return { kind: "off" };
  const res = await fetch(`${BASE}/subscription?endpoint=${encodeURIComponent(sub.endpoint)}`, {
    cache: "no-store",
  });
  if (!res.ok) return { kind: "off" };
  const data = (await res.json()) as { subscription: { hour: number } | null };
  return data.subscription ? { kind: "on", hour: data.subscription.hour } : { kind: "off" };
}

export function PushReminderCard() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [hour, setHour] = useState(DEFAULT_HOUR);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void readStatus()
      .catch((): Status => ({ kind: "off" }))
      .then((next) => {
        if (cancelled) return;
        if (next.kind === "on") setHour(next.hour);
        setStatus(next);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save(sub: PushSubscription, h: number) {
    const res = await fetch(`${BASE}/subscription`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: sub.toJSON(),
        hour: h,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        userAgent: navigator.userAgent,
      }),
    });
    if (!res.ok) throw new Error(await errorText(res));
  }

  async function enable() {
    setBusy(true);
    setMessage(null);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setStatus(permission === "denied" ? { kind: "denied" } : { kind: "off" });
        return;
      }
      const reg = await swRegistration();
      if (!reg) throw new Error("Service worker chưa sẵn sàng. Tải lại trang rồi thử lại.");
      const keyRes = await fetch(`${BASE}/public-key`, { cache: "no-store" });
      if (!keyRes.ok) throw new Error(await errorText(keyRes));
      const { publicKey } = (await keyRes.json()) as { publicKey: string };
      const applicationServerKey = keyToBytes(publicKey);
      let sub: PushSubscription;
      try {
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      } catch (err) {
        // An old subscription made with a different server key blocks a new one.
        const old = await reg.pushManager.getSubscription();
        if (!old) throw err;
        await old.unsubscribe();
        sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      }
      await save(sub, hour);
      setStatus({ kind: "on", hour });
      setMessage("Đã bật nhắc ôn tập trên thiết bị này.");
    } catch (err) {
      setMessage((err as Error).message || "Không bật được thông báo.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMessage(null);
    try {
      const reg = await swRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await fetch(`${BASE}/subscription?endpoint=${encodeURIComponent(sub.endpoint)}`, {
          method: "DELETE",
        });
        await sub.unsubscribe();
      }
      setStatus({ kind: "off" });
      setMessage("Đã tắt nhắc ôn tập trên thiết bị này.");
    } catch (err) {
      setMessage((err as Error).message || "Không tắt được thông báo.");
    } finally {
      setBusy(false);
    }
  }

  async function changeHour(h: number) {
    setHour(h);
    if (status.kind !== "on") return;
    setBusy(true);
    setMessage(null);
    try {
      const reg = await swRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (!sub) {
        setStatus({ kind: "off" });
        return;
      }
      await save(sub, h);
      setStatus({ kind: "on", hour: h });
      setMessage(`Sẽ nhắc lúc ${String(h).padStart(2, "0")}:00 mỗi ngày.`);
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setBusy(true);
    setMessage(null);
    try {
      const reg = await swRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (!sub) throw new Error("Thiết bị này chưa bật nhắc ôn tập.");
      const res = await fetch(`${BASE}/test`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: sub.endpoint }),
      });
      if (!res.ok) throw new Error(await errorText(res));
      setMessage("Đã gửi thông báo thử. Nếu không thấy, kiểm tra cài đặt thông báo của máy.");
    } catch (err) {
      setMessage((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const btn =
    "min-h-11 rounded-lg px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60";
  const primary = `${btn} bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[var(--primary-hover)]`;
  const secondary = `${btn} border border-[var(--border)] text-[var(--foreground)] hover:bg-[var(--layer-hover)]`;

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--background-1)] p-6">
      <h2 className="text-sm font-semibold text-[var(--foreground)]">Nhắc ôn tập mỗi ngày</h2>
      <p className="mt-1 text-sm text-[var(--muted-foreground)]">
        Nhận thông báo khi có từ đến hạn ôn. Chỉ gửi khi bạn có từ cần ôn, tối đa một lần mỗi ngày.
      </p>

      {status.kind === "loading" && (
        <p className="mt-4 text-sm text-[var(--muted-foreground)]">Đang kiểm tra…</p>
      )}

      {status.kind === "unsupported" && (
        <p className="mt-4 text-sm text-[var(--foreground)]">
          {status.reason === "ios-browser"
            ? "Trên iPhone/iPad, thông báo chỉ hoạt động khi đã cài Nihongo Path lên màn hình chính (iOS 16.4 trở lên). Cài app, mở từ icon, rồi bật ở đây."
            : "Trình duyệt này không hỗ trợ thông báo đẩy. Hãy dùng Chrome, Edge, Firefox hoặc Safari bản mới."}
        </p>
      )}

      {status.kind === "server-off" && (
        <p className="mt-4 text-sm text-[var(--foreground)]">Máy chủ chưa bật tính năng thông báo.</p>
      )}

      {status.kind === "denied" && (
        <p className="mt-4 text-sm text-[var(--foreground)]">
          Bạn đã chặn thông báo cho trang này. Mở cài đặt trang của trình duyệt (biểu tượng ổ khoá cạnh địa chỉ,
          hoặc cài đặt ứng dụng trên điện thoại), cho phép <strong>Thông báo</strong>, rồi tải lại trang.
        </p>
      )}

      {(status.kind === "off" || status.kind === "on") && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-[var(--foreground)]">
            Giờ nhắc
            <select
              value={hour}
              disabled={busy}
              onChange={(e) => void changeHour(Number(e.target.value))}
              className="min-h-11 rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </select>
          </label>
          {status.kind === "off" ? (
            <button type="button" disabled={busy} onClick={() => void enable()} className={primary}>
              Bật nhắc ôn tập
            </button>
          ) : (
            <>
              <button type="button" disabled={busy} onClick={() => void sendTest()} className={secondary}>
                Gửi thử
              </button>
              <button type="button" disabled={busy} onClick={() => void disable()} className={secondary}>
                Tắt
              </button>
            </>
          )}
        </div>
      )}

      {message && (
        <p role="status" className="mt-3 text-sm text-[var(--muted-foreground)]">
          {message}
        </p>
      )}
    </section>
  );
}

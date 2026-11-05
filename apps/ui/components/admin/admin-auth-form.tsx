"use client";

import { useState } from "react";
import { AuthForm } from "@/components/auth/auth-form";

/**
 * Admin-area auth form with a login / register toggle (admin login page).
 *
 * - **Đăng nhập** keeps `admin: true` — an existing admin lands in the
 *   `/admin` dashboard after sign-in.
 * - **Đăng ký** uses the learner flow (`admin: false`) — a fresh account
 *   is always created with the schema-default `USER` role (there is no
 *   self-service admin grant; the API role is the gate), so it lands in
 *   `/learn` instead of the "không đủ quyền" admin state.
 *
 * `key={mode}` resets the form fields when the mode flips.
 */
export function AdminAuthForm() {
  const [mode, setMode] = useState<"login" | "register">("login");

  const tabClass = (active: boolean) =>
    "rounded-md px-3 py-1.5 text-sm font-medium transition-colors " +
    (active
      ? "bg-[var(--background)] text-[var(--foreground)] shadow-sm"
      : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]");

  return (
    <div>
      <div
        className="mt-8 grid grid-cols-2 gap-1 rounded-lg bg-[var(--layer)] p-1"
        role="tablist"
        aria-label="Chế độ đăng nhập"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === "login"}
          onClick={() => setMode("login")}
          className={tabClass(mode === "login")}
        >
          Đăng nhập
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "register"}
          onClick={() => setMode("register")}
          className={tabClass(mode === "register")}
        >
          Đăng ký
        </button>
      </div>

      <AuthForm key={mode} mode={mode} admin={mode === "login"} />
    </div>
  );
}

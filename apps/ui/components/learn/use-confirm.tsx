"use client";

import { useCallback, useRef, useState, type ReactNode } from "react";
import { ConfirmDialog } from "@/components/learn/confirm-dialog";

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  tone?: "danger" | "primary";
}

/**
 * Promise-based replacement for `window.confirm`. Render `dialog` once in the
 * component tree and `await confirm({...})` before any delete/update call.
 */
export function useConfirm(): {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  dialog: ReactNode;
} {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setOpts(o);
    });
  }, []);

  const close = useCallback((ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpts(null);
  }, []);

  const dialog = (
    <ConfirmDialog
      open={opts !== null}
      title={opts?.title ?? ""}
      message={opts?.message ?? ""}
      confirmLabel={opts?.confirmLabel ?? "Xác nhận"}
      tone={opts?.tone ?? "danger"}
      onConfirm={() => close(true)}
      onCancel={() => close(false)}
    />
  );

  return { confirm, dialog };
}

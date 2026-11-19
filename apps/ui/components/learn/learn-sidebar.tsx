"use client";

import { useState } from "react";
import { ProgressPanel } from "@/components/learn/progress-panel";
import { PushReminderCard } from "@/components/pwa/push-reminder-card";
import { InstallAppCard } from "@/components/pwa/install-app-card";

/** Progress + reminders. Side by side (stacked) on desktop; a two-tab switch on small screens so the page never scrolls. */
export function LearnSidebar() {
  const [tab, setTab] = useState<"progress" | "remind">("progress");
  const tabCls = (on: boolean) =>
    "min-h-10 flex-1 rounded-lg px-3 text-sm font-medium transition-colors " +
    (on ? "bg-[var(--foreground)] text-[var(--background)]" : "text-[var(--muted-foreground)]");
  return (
    <aside className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden lg:gap-3 [&_section]:rounded-2xl">
      <div role="tablist" className="flex shrink-0 rounded-xl border border-[var(--border)] bg-[var(--background-1)] p-1 lg:hidden">
        <button type="button" role="tab" aria-selected={tab === "progress"} className={tabCls(tab === "progress")} onClick={() => setTab("progress")}>
          Tiến độ
        </button>
        <button type="button" role="tab" aria-selected={tab === "remind"} className={tabCls(tab === "remind")} onClick={() => setTab("remind")}>
          Nhắc nhở & ứng dụng
        </button>
      </div>
      <div className={(tab === "progress" ? "flex" : "hidden") + " min-h-0 flex-1 flex-col lg:flex lg:flex-initial"}>
        <ProgressPanel compact />
      </div>
      <div className={(tab === "remind" ? "flex" : "hidden") + " min-h-0 shrink-0 flex-col gap-2 overflow-y-auto lg:flex lg:gap-2 lg:overflow-visible [&_section]:p-3 [&_section>div>img]:size-8 [&_section>div]:gap-3 [&_h2]:text-xs [&_p]:text-xs [&_p]:leading-snug [&_li]:text-xs [&_label]:text-xs [&_button]:!min-h-8 [&_button]:!py-1 [&_button]:!text-xs [&_select]:!min-h-8 [&_select]:!py-1 [&_select]:!text-xs [&_[class*=mt-4]]:!mt-2 [&_[class*=mt-3]]:!mt-1.5"}>
        <PushReminderCard />
        <InstallAppCard />
      </div>
    </aside>
  );
}

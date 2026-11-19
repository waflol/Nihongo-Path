import { ProgressPanel } from "@/components/learn/progress-panel";

/**
 * Progress column beside the chart on desktop. Below lg the aside dissolves
 * (`contents`) so the progress card sits above the tiles. Reminders and app
 * install live behind the bell button in the page header.
 */
export function LearnSidebar() {
  return (
    <aside className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden max-lg:contents lg:col-start-1 lg:row-start-1 lg:flex-none lg:gap-3 [&_section]:rounded-2xl lg:[&_section]:rounded-r-none lg:[&_section]:border-r-0">
      <div className="flex min-h-0 flex-col max-lg:order-1 lg:order-2 lg:flex-1">
        <ProgressPanel compact />
      </div>
    </aside>
  );
}

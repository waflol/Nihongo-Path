import { ProgressPanel } from "@/components/learn/progress-panel";
import { ReviewChart } from "@/components/learn/review-chart";
import type { PillarId } from "@/components/learn/pillar-nav";

/**
 * Progress + activity charts of one pillar, on top of its landing page. Below lg
 * the activity chart sits inside the progress card.
 */
export function PillarProgress({ pillar, className = "" }: { pillar: PillarId; className?: string }) {
  return (
    <div className={"mx-auto w-full px-4 pt-4 sm:px-6 " + className}>
      <div className="grid gap-3 lg:grid-cols-[26rem_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col">
          <ProgressPanel compact pillar={pillar} />
        </div>
        <ReviewChart pillar={pillar} className="hidden lg:flex" />
      </div>
    </div>
  );
}

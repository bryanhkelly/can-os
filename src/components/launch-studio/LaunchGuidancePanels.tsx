import { SiteGuideV61, type SiteGuideContentV61 } from "./SiteGuideV61";

export type LaunchGuidance = {
  why: string;
  tip?: string;
  next: string;
};

/** One shared companion panel for Launch Studio steps. Live screen context
 * replaces default guidance only when it is actually available. */
export function LaunchGuidancePanels({ guidance, guide }: {
  guidance: LaunchGuidance;
  guide?: SiteGuideContentV61 | null;
}) {
  return <SiteGuideV61 guide={guide ?? {
    summary: guidance.why, insight: guidance.tip, next: guidance.next,
  }} />;
}

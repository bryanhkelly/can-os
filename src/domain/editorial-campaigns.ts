import { selectDailyCanvasContent, type DailyCanvasContent } from "@/components/student/DailyCanvas";

/**
 * CAN OS Editorial Canvas — safe, read-only fallback content.
 *
 * Publishing workflows must provide approved campaign records through an owning
 * service. These local entries are evergreen fallback copy, not proof of
 * publication, a network announcement, or an operational authorization.
 */
export const DEFAULT_EDITORIAL_CAMPAIGNS = [
  {
    id: "student-evergreen",
    audience: "student",
    priority: "default",
    campaignLabel: "Your learning day",
    headline: "Make today count.",
    supportingCopy: "A fresh start, a clear next step, and everything you need to keep learning.",
  },
  {
    id: "teacher-evergreen",
    audience: "teacher",
    priority: "default",
    campaignLabel: "Your teaching day",
    headline: "Make room for great teaching.",
    supportingCopy: "Your classes, student work, and next steps are ready when you are.",
  },
  {
    id: "guardian-evergreen",
    audience: "guardian",
    priority: "default",
    campaignLabel: "Your family, connected",
    headline: "Every school day, together.",
    supportingCopy: "Follow your children’s progress and stay connected with their school.",
  },
  {
    id: "site-evergreen",
    audience: "site",
    priority: "default",
    campaignLabel: "Your school day",
    headline: "Lead with clarity.",
    supportingCopy: "Know what needs your attention and where to go next.",
  },
  {
    id: "operations-evergreen",
    audience: "operations",
    priority: "default",
    campaignLabel: "CAN operations",
    headline: "Focus on what matters next.",
    supportingCopy: "Your active school workflows and assigned actions in one place.",
  },
  {
    id: "network-evergreen",
    audience: "network",
    priority: "default",
    campaignLabel: "Connected communities",
    headline: "A shared mission, local impact.",
    supportingCopy: "Support your network’s school partnerships and next steps.",
  },
] as const satisfies readonly DailyCanvasContent[];

/**
 * An approved editorial feed, when introduced, can be passed as entries.
 * Audience, start/end, and precedence are enforced by the shared selector.
 * Never source urgent operational notices from unapproved campaign copy.
 */
export function resolveEditorialCanvas(
  audience: DailyCanvasContent["audience"],
  now: Date,
  entries: readonly DailyCanvasContent[] = [],
): DailyCanvasContent | null {
  return selectDailyCanvasContent(
    [...entries, ...DEFAULT_EDITORIAL_CAMPAIGNS],
    audience,
    now,
  );
}

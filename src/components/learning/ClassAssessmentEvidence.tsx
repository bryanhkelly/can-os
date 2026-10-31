import type { ReactNode } from "react";
import { WorkspacePanel } from "@/components/workspace";

export type ClassAssessmentEvidenceItem = {
  id: string;
  title: string;
  score: string | number | null;
  pointsPossible: string | number | null;
  status: string;
};

export function ClassAssessmentEvidence({
  items, summary, isTeacher, classwork,
}: {
  items: readonly ClassAssessmentEvidenceItem[];
  summary: { graded: number; awaitingFeedback: number } | null | undefined;
  isTeacher: boolean;
  classwork: ReactNode;
}) {
  return <WorkspacePanel title="Assessment evidence"
    description="Teacher-reviewed submissions are different from lesson completion. Scores shown here are not a mastery decision or course credit.">
    <p className="text-sm">{items.length} published class assessments
      {!isTeacher && summary ? ` · ${summary.graded} graded · ${summary.awaitingFeedback} awaiting feedback` : ""}
    </p>
    {!isTeacher && items.length > 0 && <ul className="mt-3 divide-y text-sm">
      {items.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
        <span>{item.title}</span>
        <span className="text-muted-foreground">
          {item.score !== null && item.pointsPossible !== null
            ? `Reviewed: ${item.score} / ${item.pointsPossible} points`
            : item.status === "submitted" ? "Submitted · awaiting teacher review"
            : item.status === "draft" ? "Response in progress"
            : item.status === "returned" ? "Returned for revision" : "Not graded"}
        </span>
      </li>)}
    </ul>}
    <div className="mt-3 text-sm">{classwork}</div>
  </WorkspacePanel>;
}

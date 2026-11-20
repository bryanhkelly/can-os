import { Link } from "@tanstack/react-router";
import { ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DashboardPanel } from "@/components/workspace/dashboard-layout";
import { plural } from "@/lib/format";

/** Presentation-only priority panel. The parent owns authorization and data loading. */
export function TeacherNextActionPanel({
  ungradedCount, missingWorkCount, nextUngraded,
}: {
  ungradedCount: number;
  missingWorkCount: number;
  nextUngraded?: { sectionId: string; assessmentId: string; studentProfileId: string };
}) {
  return <DashboardPanel title="What needs you next" className="mt-7">
    {ungradedCount > 0 ? <div className="mt-3">
      <p className="font-semibold">{plural(ungradedCount, "submitted work item")} to review</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Start with a submission from your current assigned sections.
      </p>
      <Button asChild size="lg" className="mt-3">
        {nextUngraded ? <Link to="/teacher/gradebook" search={{
          section: nextUngraded.sectionId,
          assessment: nextUngraded.assessmentId,
          student: nextUngraded.studentProfileId,
        }}>
          Grade next submission <ArrowUpRight aria-hidden="true" className="size-4" />
        </Link> : <Link to="/teacher/gradebook">
          Open grading queue <ArrowUpRight aria-hidden="true" className="size-4" />
        </Link>}
      </Button>
    </div> : missingWorkCount > 0 ? <div className="mt-3">
      <p className="font-semibold">{plural(missingWorkCount, "missing-work follow-up")}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        Review missing work and follow up with students through the existing teacher workflow.
      </p>
      <Button asChild size="lg" className="mt-3">
        <Link to="/teacher/missing-work">
          Review missing work <ArrowUpRight aria-hidden="true" className="size-4" />
        </Link>
      </Button>
    </div> : <div className="mt-3">
      <p className="text-sm text-muted-foreground">
        No grading or missing-work items in the current snapshot. Review your schedule and prepare your next class.
      </p>
      <Link to="/class" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold underline">
        Open my classes →
      </Link>
    </div>}
  </DashboardPanel>;
}

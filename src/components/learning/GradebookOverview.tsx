import { StatCard, WorkspacePanel } from "@/components/workspace";

export function GradebookOverview({
  studentCount,
  assessmentCount,
  submittedCount,
  showQueueEmpty,
}: {
  studentCount: number;
  assessmentCount: number;
  submittedCount: number;
  showQueueEmpty: boolean;
}) {
  return (
    <>
      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <StatCard label="Students" value={studentCount} />
        <StatCard label="Assessments" value={assessmentCount} />
        <StatCard label="Needs grading" value={submittedCount} />
      </div>
      {showQueueEmpty && (
        <WorkspacePanel title="All caught up">
          <p className="text-sm text-muted-foreground">
            There are no submitted assignments awaiting grading in this section. New student submissions will appear here.
          </p>
        </WorkspacePanel>
      )}
    </>
  );
}

import { Link } from "@tanstack/react-router";

interface ReviewCell {
  submissionId: string | null;
  assessmentId: string;
  studentProfileId: string;
  status: string;
  gradingDraft?: unknown;
}

interface ReviewStudent {
  studentProfileId: string;
  displayName: string;
}

interface ReviewAssessment {
  id: string;
  title: string;
}

/** The caller supplies the authorized gradebook's submitted work only. */
export function GradebookReviewQueue({
  cells,
  students,
  assessments,
  sectionId,
  activeSubmissionId,
}: {
  cells: readonly ReviewCell[];
  students: readonly ReviewStudent[];
  assessments: readonly ReviewAssessment[];
  sectionId: string;
  activeSubmissionId?: string | null;
}) {
  return (
    <nav aria-label="Submission queue" className="grid max-h-96 gap-2 overflow-y-auto">
      {cells.map((cell) => {
        const active = activeSubmissionId === cell.submissionId;
        return (
          <Link
            key={cell.submissionId}
            to="/teacher/gradebook"
            search={{ section: sectionId, assessment: cell.assessmentId, student: cell.studentProfileId }}
            aria-current={active ? "page" : undefined}
            className={`rounded-lg border p-3 text-sm ${active ? "bg-muted" : "hover:bg-muted"}`}
          >
            <span className="block font-semibold">
              {students.find((student) => student.studentProfileId === cell.studentProfileId)?.displayName ?? "Student"}
            </span>
            <span className="mt-1 block text-xs text-muted-foreground">
              {assessments.find((assessment) => assessment.id === cell.assessmentId)?.title ?? "Assessment"}
              {" · "}{cell.gradingDraft ? "Draft saved · not released" : cell.status}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}

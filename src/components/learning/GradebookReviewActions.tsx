import { Link } from "@tanstack/react-router";

export function GradebookReviewActions(props: {
  busy: boolean;
  sectionId: string;
  onSaveDraft: () => void;
  onPostGrade: () => void;
}) {
  return <div className="flex flex-wrap gap-3">
    <button type="button" disabled={props.busy} onClick={props.onSaveDraft}
      className="rounded-lg border px-4 py-2 text-sm disabled:opacity-50">Save grading draft</button>
    <button type="button" disabled={props.busy} onClick={props.onPostGrade}
      className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background disabled:opacity-50">Post grade</button>
    <Link to="/teacher/gradebook" search={{section:props.sectionId}}
      className="rounded-lg border px-4 py-2 text-sm">Close review</Link>
  </div>;
}

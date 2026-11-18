import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

export function GradebookReviewActions(props: {
  busy: boolean;
  sectionId: string;
  onSaveDraft: () => void;
  onPostGrade: () => void;
}) {
  return <div className="flex flex-wrap gap-3">
    <Button type="button" variant="outline" disabled={props.busy} onClick={props.onSaveDraft}>
      Save grading draft
    </Button>
    <Button type="button" disabled={props.busy} onClick={props.onPostGrade}>
      Post grade
    </Button>
    {props.busy
      ? <Button type="button" variant="ghost" disabled>Close review</Button>
      : <Button asChild variant="ghost"><Link to="/teacher/gradebook" search={{section:props.sectionId}}>
          Close review
        </Link></Button>}
  </div>;
}

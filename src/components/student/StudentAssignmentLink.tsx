import { forwardRef, type ComponentPropsWithoutRef } from "react";
import { Link } from "@tanstack/react-router";
import {
  studentAssignmentDetailRoute,
  type StudentAssignmentFilter,
} from "@/domain/student-assignment-navigation";

type StudentAssignmentLinkProps = Omit<ComponentPropsWithoutRef<"a">, "href"> & {
  assessmentId: string;
  sectionId?: string | null;
  filter?: StudentAssignmentFilter;
};

/** V6.1 assignment navigation primitive.
 * Forwards anchor props and refs so shared Button, Slot, and dashboard actions
 * retain focus, keyboard behavior, and accessible labels.
 */
export const StudentAssignmentLink = forwardRef<HTMLAnchorElement, StudentAssignmentLinkProps>(
  function StudentAssignmentLink({ assessmentId, sectionId, filter, ...anchorProps }, ref) {
    return <Link
      {...anchorProps}
      ref={ref}
      to={studentAssignmentDetailRoute}
      params={{ assessmentId }}
      search={{ section: sectionId ?? undefined, filter }}
    />;
  },
);

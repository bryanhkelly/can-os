import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  studentAssignmentDetailRoute,
  type StudentAssignmentFilter,
} from "@/domain/student-assignment-navigation";

/** V6.1 navigation primitive used by student learning, actions, and dashboards.
 * The detail route remains authoritative; optional search preserves return context.
 */
export function StudentAssignmentLink({
  assessmentId, sectionId, filter, className, children, title, "aria-label": ariaLabel,
}: {
  assessmentId: string;
  sectionId?: string | null;
  filter?: StudentAssignmentFilter;
  className?: string;
  children?: ReactNode;
  title?: string;
  "aria-label"?: string;
}) {
  return <Link
    to={studentAssignmentDetailRoute}
    params={{ assessmentId }}
    search={{ section: sectionId ?? undefined, filter }}
    className={className}
    title={title}
    aria-label={ariaLabel}
  >{children}</Link>;
}

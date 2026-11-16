import type { ReactNode } from "react";
import { ClassroomWorkspace, type ClassroomReturnTo } from "./ClassroomWorkspace";

/**
 * One CAN OS classroom player for every Class. The layout, lesson-tools rail,
 * navigation, sharing and exit behavior are shared. Authorized instructional
 * content is supplied by the Course Attempt / academic Class service, not by
 * the route name or an inferred enrollment type.
 *
 * Projector control remains a distinct facilitator-authorized delivery surface;
 * it must not be mistaken for a learner's playback or progress evidence.
 */
export type UnifiedCoursePlayerProps = {
  context: ClassroomReturnTo;
  title: string;
  subtitle: string;
  lessonTitle?: string;
  lessonPosition?: {current:number;total:number};
  rail: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  metadata?: ReactNode;
};
export function UnifiedCoursePlayer({context, ...props}:UnifiedCoursePlayerProps){
  return <ClassroomWorkspace returnTo={context} {...props}/>;
}

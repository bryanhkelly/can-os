import { createFileRoute, Navigate } from "@tanstack/react-router";

/** /canonical is the pre-design parking lot. Course activity authoring
 * has been promoted into /class; the staging URL only forwards bookmarks.
 * Publisher authorization is enforced by its existing server commands. */
export const Route=createFileRoute("/canonical/course-activities")({
  component:StagedCourseActivitiesLocation,
});
function StagedCourseActivitiesLocation(){
  return <Navigate to="/class" search={{view:"activities"}} replace/>;
}

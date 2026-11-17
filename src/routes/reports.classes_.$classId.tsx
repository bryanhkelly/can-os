import { createFileRoute, Navigate } from "@tanstack/react-router";

/** Historical Class reporting URL retained for bookmarks.
 * Source-backed Class evidence now renders in /class/:id, never a parallel
 * manager/report workspace. Existing report access checks remain server-side. */
export const Route=createFileRoute("/reports/classes_/$classId")({
  component: LegacyClassReportLocation,
});
function LegacyClassReportLocation(){
  const {classId}=Route.useParams();
  return <Navigate to="/class/$classId" params={{classId}}
    search={{view:"manage",tab:"reports"}} replace/>;
}

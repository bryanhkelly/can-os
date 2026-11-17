import {createFileRoute,Link} from "@tanstack/react-router";
import {WorkspaceShell} from "@/components/workspace";
import {NativeClassReportPanel} from "@/components/reports/NativeClassReportPanel";

export const Route=createFileRoute("/reports/classes_/$classId")({
  component:ClassReportPage,
});
function ClassReportPage(){
  const {classId}=Route.useParams();
  return <WorkspaceShell eyebrow="CAN OS · Reporting" title="Class evidence"
    width="wide" subtitle="Verified registrations, delivery, attendance, assessments and awards, without deriving results from content playback.">
    <div className="mt-4 mb-6">
      <Link to="/classes/$classId" params={{classId}}
        search={{view:"manage",tab:"reports",lesson:undefined,session:undefined}}
        className="text-sm font-semibold underline">
        Return to Class workspace
      </Link>
    </div>
    <NativeClassReportPanel classId={classId}/>
  </WorkspaceShell>;
}

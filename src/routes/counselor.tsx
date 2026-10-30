import { createFileRoute } from "@tanstack/react-router";
import { CoachPage } from "./coach";
export const Route = createFileRoute("/counselor")({
  validateSearch: (search:Record<string,unknown>):{student?:string}=>({student:typeof search.student==="string"?search.student:undefined}),
  component:CounselorWorkspace,
});
function CounselorWorkspace(){
  const {student}=Route.useSearch();
  const navigate=Route.useNavigate();
  return <CoachPage key={student??"all"} title="Counselor caseload" studentProfileId={student}
    selectStudent={id=>void navigate({search:{student:id}})}/>;
}

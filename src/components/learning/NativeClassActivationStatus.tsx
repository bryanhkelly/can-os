import { useQuery } from "@tanstack/react-query";
import { WorkspacePanel, RecordFacts, StatusBadge } from "@/components/workspace";
import { getNativeClassActivationStatus } from "@/modules/classes/native-class-activation-status.functions";

/** Exact-Class operational delivery health. Never list learner addresses. */
export function NativeClassActivationStatus({classId}:{classId:string}){
  const snapshot=useQuery({
    queryKey:["native-class-activation-status",classId],
    queryFn:()=>getNativeClassActivationStatus({data:{classId}}),retry:false,
  });
  return <WorkspacePanel title="Enrollment-to-Class activation"
    description="Confirmed participation, upcoming Sessions and participant communication receipts.">
    {snapshot.isPending&&<p role="status" className="text-sm">Checking current Class activation…</p>}
    {snapshot.isError&&<p role="alert" className="text-sm">
      Delivery health could not be verified with your current Class authorization.
    </p>}
    {snapshot.data&&<>
      <RecordFacts columns={2} label="Class activation facts" items={[
        {label:"Active enrollments",value:String(snapshot.data.enrolled)},
        {label:"Upcoming Sessions",value:String(snapshot.data.upcomingSessions)},
        {label:"Provider accepted",value:String(snapshot.data.communications.accepted)},
        {label:"Pending or processing",value:String(
          snapshot.data.communications.pending+snapshot.data.communications.processing)},
        {label:"Failed",value:String(snapshot.data.communications.failed)},
        {label:"Suppressed",value:String(snapshot.data.communications.suppressed)},
      ]}/>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {snapshot.data.communications.failed>0
          ?<StatusBadge tone="attention">Communication failures need review</StatusBadge>
          :<StatusBadge tone="neutral">Delivery receipts recorded</StatusBadge>}
        {snapshot.data.upcomingSessions===0&&
          ["scheduled","facilitated","hybrid"].includes(snapshot.data.deliveryMode)&&
          <StatusBadge tone="attention">No upcoming Sessions scheduled</StatusBadge>}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{snapshot.data.note}</p>
    </>}
  </WorkspacePanel>;
}

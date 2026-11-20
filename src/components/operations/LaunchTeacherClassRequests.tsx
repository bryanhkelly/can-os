import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { getLaunchAcademicSetup } from "@/modules/programs/launch-academics.functions";

type Snapshot = Awaited<ReturnType<typeof getLaunchAcademicSetup>>;
export type LaunchClassRequest = Snapshot["classRequests"][number];

/** Controlled review of teacher-proposed Classes. A request is not an
 * authorized Section, instructional assignment or enrollment approval.
 * The owning workspace retains selection and institutional commands.
 */
export function LaunchTeacherClassRequests({
  requests, busy, declineReasons, onPrepare, onReasonChange, onDecline,
}: {
  requests: readonly LaunchClassRequest[];
  busy: boolean;
  declineReasons: Readonly<Record<string,string>>;
  onPrepare: (request: LaunchClassRequest) => void;
  onReasonChange: (requestId:string,value:string) => void;
  onDecline: (requestId:string,reason:string) => void | Promise<void>;
}) {
  return <section className="mt-7 border bg-card p-5" aria-labelledby="teacher-class-requests">
    <h2 id="teacher-class-requests" className="font-serif text-2xl">Teacher class requests</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Review teacher proposals here. Creating a request does not create a Section;
      approved course content, school-year schedule, instructor qualifications
      and the existing launch checks still apply.
    </p>
    <div className="mt-4 space-y-3">
      {requests.map(request=><article key={request.id} className="border p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">
              Requested by {request.requesterName} · {request.requestedCourseOrSubject} · {request.desiredTerm}
            </p>
            <h3 className="mt-1 font-semibold">{request.requestedClassTitle}</h3>
            {request.schedulePreference&&<p className="mt-2 text-sm">Schedule preference: {request.schedulePreference}</p>}
            {request.notes&&<p className="mt-2 whitespace-pre-wrap text-sm">{request.notes}</p>}
          </div>
          <Button type="button" variant="outline" size="sm" disabled={busy}
            onClick={()=>onPrepare(request)}>Prepare class setup</Button>
        </div>
        <details className="mt-3 border-t pt-3">
          <summary className="cursor-pointer text-sm font-medium">Decline request</summary>
          <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={event=>{
            event.preventDefault();
            const reason=(declineReasons[request.id]??"").trim();
            if(reason.length<5)return;
            void onDecline(request.id,reason);
          }}>
            <Label className="min-w-60 flex-1">Reason
              <Textarea required minLength={5} maxLength={1000}
                value={declineReasons[request.id]??""}
                onChange={event=>onReasonChange(request.id,event.target.value)}
                rows={2} className="mt-1"/>
            </Label>
            <Button type="submit" variant="outline" size="sm"
              disabled={busy||(declineReasons[request.id]?.trim().length??0)<5}>
              Decline request
            </Button>
          </form>
        </details>
      </article>)}
      {!requests.length&&<p role="status" className="border p-4 text-sm text-muted-foreground">
        No pending teacher class requests for this program.
      </p>}
    </div>
  </section>;
}

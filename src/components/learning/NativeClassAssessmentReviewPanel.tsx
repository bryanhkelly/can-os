import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { normalizeClientError } from "@/lib/client-error";
import {
  finalizeNativeClassKnowledgeCheck,getNativeClassPendingKnowledgeReviews,
} from "@/modules/classes/native-class-assessment-finalize.functions";

/** Provider-only confirmation of existing canonical item scores.
 * Never presents raw answers, hidden keys, grades or awards.
 */
export function NativeClassAssessmentReviewPanel({classId}:{classId:string}){
  const client=useQueryClient();
  const [pending,setPending]=useState<string|null>(null);
  const [notice,setNotice]=useState("");
  const [error,setError]=useState("");
  const queue=useQuery({
    queryKey:["native-class-assessment-review",classId],
    queryFn:()=>getNativeClassPendingKnowledgeReviews({data:{classId}}),
    retry:false,refetchOnReconnect:true,
  });
  async function confirm(classEnrollmentId:string,assessmentAttemptId:string){
    if(pending)return;
    setPending(assessmentAttemptId);setNotice("");setError("");
    try{
      const result=await finalizeNativeClassKnowledgeCheck({
        data:{classEnrollmentId,assessmentAttemptId},
      });
      setNotice(result.alreadyFinalized?
        "This canonical assessment result was already finalized.":
        "Canonical assessment result independently confirmed. A training completion decision is separate.");
      await Promise.all([
        client.invalidateQueries({queryKey:["native-class-assessment-review",classId]}),
        client.invalidateQueries({queryKey:["native-class-canonical-evidence"]}),
      ]);
    }catch(e){
      setError(normalizeClientError(e,
        "Unable to confirm this result. Verify independent provider authority and current Class/assessment evidence.").message);
    }finally{setPending(null);}
  }
  return <section className="mt-5 border border-border bg-card p-5"
    aria-label="Independent Course assessment review">
    <h2 className="font-serif text-xl">Knowledge-check confirmations</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Only authorized provider registrars with independent assessment
      authority can confirm published canonical assessment scores.
      This does not award academic grades, certificates or course completion.
    </p>
    {queue.isPending&&<p role="status" className="mt-3 text-sm">
      Checking provider review authority…
    </p>}
    {queue.isError&&<p role="status" className="mt-3 text-sm">
      The review queue is unavailable or your role is not permitted to finalize scores.
    </p>}
    {queue.data&&<div className="mt-4 space-y-3">
      {queue.data.pending.length===0&&<p className="text-sm">
        No provisionally scored checks are awaiting independent confirmation.
      </p>}
      {queue.data.pending.map(item=><div key={item.assessmentAttemptId}
        className="flex flex-wrap items-center justify-between gap-3 border border-border p-3 text-sm">
        <div>
          <p className="font-semibold">{item.learnerName}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Submitted {item.submittedAt?
              new Date(item.submittedAt).toLocaleString():"at an unrecorded time"}
          </p>
        </div>
        <Button type="button" size="sm" variant="outline"
          disabled={!!pending} onClick={()=>void confirm(
            item.classEnrollmentId,item.assessmentAttemptId)}>
          {pending===item.assessmentAttemptId?"Confirming…":"Confirm canonical score"}
        </Button>
      </div>)}
      {queue.data.partial&&<p className="text-xs text-muted-foreground">
        Showing the first 100 pending reviews. Additional reviews require pagination.
      </p>}
      <Button type="button" variant="outline" size="sm" disabled={queue.isFetching}
        onClick={()=>void queue.refetch()}>
        Refresh pending reviews
      </Button>
    </div>}
    {notice&&<p role="status" className="mt-3 text-sm">{notice}</p>}
    {error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
  </section>;
}

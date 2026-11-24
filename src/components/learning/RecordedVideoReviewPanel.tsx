import {useState} from "react";
import {useQuery,useQueryClient} from "@tanstack/react-query";
import {Button} from "@/components/ui/button";
import {Field} from "@/components/ui/field";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";
import {Textarea} from "@/components/ui/textarea";
import {ClassVideoPlayer} from "@/components/learning/ClassVideoPlayer";
import {WorkspacePanel,WorkspaceNotice,EmptyState,MutationFeedback,StatusBadge} from "@/components/workspace";
import {useMutationFeedback} from "@/lib/mutation-feedback";
import {listRecordedVideoReviews,previewRecordedVideoForReview,decideRecordedVideoReview,publishReviewedRecordedVideo} from "@/modules/learning/recorded-video-review.functions";
type Item=Awaited<ReturnType<typeof listRecordedVideoReviews>>["items"][number];
export function RecordedVideoReviewPanel({versions}:{versions:readonly {id:string;label:string}[]}){
 const [course,setCourse]=useState("");
 const eligible=versions.some(v=>v.id===course);
 return <WorkspacePanel title="Recording asset reviews" className="mt-6"
 description="Review the exact private recording before it can be associated with an instructional track. Publication does not authorize learner delivery.">
 <Field label="Published Course"><Select value={eligible?course:""} onChange={e=>setCourse(e.target.value)}>
 <option value="">Select an assigned Course</option>
 {versions.map(v=><option key={v.id} value={v.id}>{v.label}</option>)}
 </Select></Field>
 {eligible&&<ReviewQueue key={course} courseVersionId={course}/>}
 </WorkspacePanel>;
}
function ReviewQueue({courseVersionId}:{courseVersionId:string}){
 const queue=useQuery({queryKey:["recorded-asset-review",courseVersionId],
 queryFn:()=>listRecordedVideoReviews({data:{courseVersionId}}),retry:false});
 if(queue.isPending)return <p role="status">Checking submitted recordings…</p>;
 if(queue.isError||!queue.data)return <WorkspaceNotice tone="danger">Recording review inventory is unavailable.</WorkspaceNotice>;
 return <div className="mt-4 space-y-4">
 {queue.data.limited&&<WorkspaceNotice tone="attention">Showing up to 50 submitted recordings. Complete the current queue before relying on it as exhaustive.</WorkspaceNotice>}
 {!queue.data.items.length&&<EmptyState title="No submitted recordings" description="Creator submissions appear here after private upload and verification."/>}
 {queue.data.items.map(item=><AssetReview key={item.id+":"+item.sha256} item={item} courseVersionId={courseVersionId}/>)}
 </div>;
}
function AssetReview({item,courseVersionId}:{item:Item;courseVersionId:string}){
 const client=useQueryClient();
 const feedback=useMutationFeedback(()=>client.invalidateQueries({queryKey:["recorded-asset-review",courseVersionId]}));
 const [kind,setKind]=useState<"academic"|"rights"|"accessibility">("academic");
 const [decision,setDecision]=useState<"approved"|"rejected">("approved");
 const [evidence,setEvidence]=useState("");
 const [rationale,setRationale]=useState("");
 const ready=item.reviews.every(r=>r.decision==="approved"&&r.independent);
 const busy=feedback.pending||feedback.refreshFailed;
 const target={courseVersionId,assetVersionId:item.id,expectedHash:item.sha256};
 return <article className="border border-border bg-card p-4 space-y-4">
 <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{item.title}</h3>
 <StatusBadge tone={ready?"success":"attention"}>{ready?"Reviews recorded":"Review required"}</StatusBadge></div>
 <ClassVideoPlayer title={item.title+" · independent review"} resourceId={item.id}
 loadUrl={async()=>(await previewRecordedVideoForReview({data:target})).downloadUrl}/>
 <div className="flex flex-wrap gap-2">{item.reviews.map(r=><StatusBadge key={r.kind} tone={r.decision==="approved"&&r.independent?"success":"attention"}>{r.kind}: {r.decision??"Not reviewed"}</StatusBadge>)}</div>
 <form className="grid gap-3 sm:grid-cols-2" onSubmit={e=>{e.preventDefault();if(busy)return;
 void feedback.run(()=>decideRecordedVideoReview({data:{...target,kind,decision,evidenceVersionId:evidence.trim(),rationale:rationale.trim()}}),
 {successMessage:"Independent decision recorded.",commandErrorMessage:"Review blocked. Check the exact recording, current appointment and verified publisher evidence."});}}>
 <Field label="Review category"><Select value={kind} disabled={busy} onChange={e=>setKind(e.target.value as typeof kind)}>
 <option value="academic">Academic</option><option value="rights">Rights</option><option value="accessibility">Accessibility</option></Select></Field>
 <Field label="Decision"><Select value={decision} disabled={busy} onChange={e=>setDecision(e.target.value as typeof decision)}>
 <option value="approved">Approved</option><option value="rejected">Rejected</option></Select></Field>
 <Field label="Verified evidence version ID" required className="sm:col-span-2"><Input required disabled={busy} value={evidence} onChange={e=>setEvidence(e.target.value)} placeholder="Verified publisher evidence UUID"/></Field>
 <Field label="Review rationale" required className="sm:col-span-2"><Textarea rows={3} required minLength={10} maxLength={2000} disabled={busy} value={rationale} onChange={e=>setRationale(e.target.value)}/></Field>
 <div className="flex flex-wrap gap-2 sm:col-span-2">
 <Button type="submit" disabled={busy||rationale.trim().length<10||!evidence.trim()}>Record decision</Button>
 <Button type="button" variant="outline" disabled={busy||!ready} onClick={()=>void feedback.run(()=>publishReviewedRecordedVideo({data:target}),{successMessage:"Recording published as an immutable reviewed asset.",commandErrorMessage:"Publication blocked. Verify current approvals, rights and recording integrity."})}>Publish reviewed recording</Button>
 </div></form>
 <MutationFeedback state={feedback} pendingMessage="Verifying recording and review authority…"/>
 </article>;
}

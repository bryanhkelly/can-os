import { useState, type FormEvent } from "react";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { WorkspacePanel, WorkspaceNotice, EmptyState, MutationFeedback } from "@/components/workspace";
import { useMutationFeedback } from "@/lib/mutation-feedback";
import { invalidateNativeClassAvailability } from "@/lib/native-class-availability-cache";
import { NativeOfferingReleaseCheckpoints } from
  "@/components/learning/NativeOfferingReleaseCheckpoints";
import { NativeOfferingReleasePolicyEditor } from "@/components/learning/NativeOfferingReleasePolicyEditor";
import {
  getNativeOfferingReleaseReviewQueue, getNativeOfferingReviewContent,
  decideNativeOfferingRelease,
  publishNativeOfferingCourses, approveNativeOfferingAssetManifest,
  publishNativeOfferingVersion,
} from "@/modules/learning/native-offering-release.functions";

type Item=Awaited<ReturnType<typeof getNativeOfferingReleaseReviewQueue>>["items"][number];
const categories=["academic","rights","accessibility","coverage","safety"] as const;

function ReleaseReview({item}:{item:Item}){
  const client=useQueryClient();
  const [inspect,setInspect]=useState(false);
  const content=useQuery({
    queryKey:["native-offering-review-content",item.id,item.manifestHash],
    queryFn:()=>getNativeOfferingReviewContent({data:{
      offeringVersionId:item.offeringVersionId,manifestId:item.id,
      expectedHash:item.manifestHash,
    }}),
    enabled:inspect&&item.current,retry:false,
  });
  const [category,setCategory]=useState<(typeof categories)[number]>("academic");
  const [decision,setDecision]=useState<"rejected"|"approved">("rejected");
  const [evidence,setEvidence]=useState("");
  const [reason,setReason]=useState("");
  const feedback=useMutationFeedback(async()=>{
    await Promise.all([
      client.invalidateQueries({queryKey:["native-offering-release-review-queue"]},
        {throwOnError:true}),
      client.invalidateQueries({queryKey:["native-adoption-review-queue"]},
        {throwOnError:true}),
      invalidateNativeClassAvailability(client),
    ]);
  });
  const fullyApproved=categories.every(kind=>item.reviews.some(review=>
    review.kind===kind&&review.decision==="approved"));
  async function run(action:()=>Promise<unknown>,message:string){
    await feedback.run(action,{
      successMessage:message,
      commandErrorMessage:"Release decision was not accepted. Recheck the exact manuscript, independent appointment and verified evidence.",
      refreshErrorMessage:"The release decision was saved, but current review records could not refresh. Retry refresh before another action.",
    });
  }
  function submit(event:FormEvent){
    event.preventDefault();
    if(!item.current||item.status!=="draft"||feedback.pending||feedback.refreshFailed)return;
    void run(()=>decideNativeOfferingRelease({data:{
      offeringVersionId:item.offeringVersionId,manifestId:item.id,
      expectedHash:item.manifestHash,reviewKind:category,decision,
      evidenceVersionId:evidence.trim()||null,rationale:reason.trim(),
    }}),"Independent review decision recorded.");
  }
  const release={offeringVersionId:item.offeringVersionId,
    manifestId:item.id,expectedHash:item.manifestHash};
  return <article className="border border-border bg-card p-4">
    <h3 className="font-semibold">{item.offeringTitle}</h3>
    <p className="mt-1 text-sm text-muted-foreground">
      {item.courseCount} Course(s) · {item.manifestHash.slice(0,12)} ·
      {" "}{item.offeringPublished?"Offering published":item.allCoursesPublished?
        "Courses published, Offering pending":"Course publication pending"}
    </p>
    {!item.current&&<WorkspaceNotice tone="attention" className="mt-3">
      Content changed after submission. The publisher must submit a new version for review.
    </WorkspaceNotice>}
    <NativeOfferingReleaseCheckpoints state={{
      courseCount:item.courseCount,
      allCoursesPublished:item.allCoursesPublished,
      manifest:{
        current:item.current,status:item.status,assetCount:item.assetCount,
      },
      releasePoliciesComplete:item.releasePoliciesComplete,
      offeringPublished:item.offeringPublished,
      reviews:item.reviews,
    }}/>
    <div className="mt-3">
      <Button type="button" variant="outline" disabled={!item.current}
        onClick={()=>setInspect(value=>!value)}>
        {inspect?"Hide reviewed Course material":"Inspect exact submitted Course material"}
      </Button>
      {inspect&&content.isPending&&<p role="status" className="mt-3 text-sm">
        Loading authorized syllabus and lesson evidence…
      </p>}
      {inspect&&content.isError&&<WorkspaceNotice tone="danger" className="mt-3">
        Exact submitted Course content is unavailable. Do not approve a snapshot that cannot be inspected.
      </WorkspaceNotice>}
      {inspect&&content.isSuccess&&<section className="mt-3 grid gap-3 border border-border p-3"
        aria-label="Exact publisher Course manuscript">
        <p className="text-xs text-muted-foreground">
          Reviewer view of {content.data.lessonCount} lesson(s) across
          {" "}{content.data.courseCount} Course version(s). Manifest
          {" "}{content.data.reviewedManifestHash.slice(0,12)}.
        </p>
        <details className="border border-border p-3 text-xs">
          <summary className="cursor-pointer font-semibold">Publisher Offering definition</summary>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap">
            {JSON.stringify(content.data.productDefinition,null,2)}
          </pre>
        </details>
        <div className="border border-border p-3 text-sm">
          <h4 className="font-semibold">Pinned publisher asset versions</h4>
          {content.data.assetItems.length===0&&
            <p className="mt-2 text-xs text-muted-foreground">
              No reviewed asset uses were attached. This is a manuscript-only review.
            </p>}
          {content.data.assetItems.map(item=><p key={item.assetVersionId+item.usageKind}
            className="mt-2 break-all text-xs">
            {item.usageKind}: {item.assetVersionId} · SHA-256 {item.contentHash.slice(0,16)}
            {" "}· rights evidence {item.rightsEvidenceVersionId??"missing"}
          </p>)}
        </div>
        {content.data.courses.map(course=><article key={course.courseVersionId}
          className="border border-border p-3">
          <h4 className="font-semibold">{course.courseTitle} · {course.courseCode}</h4>
          <details className="mt-2 text-xs">
            <summary className="cursor-pointer">Review complete Course syllabus</summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap">
              {JSON.stringify(course.syllabus,null,2)}
            </pre>
          </details>
          {course.units.map(unit=><div key={unit.id} className="mt-3 border-t border-border pt-3">
            <h5 className="font-semibold">{unit.sequenceNo}. {unit.title}</h5>
            <details className="mt-1 text-xs">
              <summary className="cursor-pointer">Unit metadata</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap">
                {JSON.stringify(unit.content,null,2)}
              </pre>
            </details>
            <div className="mt-2 grid gap-2">
              {unit.lessons.map(lesson=><details key={lesson.id}
                className="border border-border p-3 text-sm">
                <summary className="cursor-pointer font-medium">
                  {lesson.lessonOrder}. {lesson.title}
                </summary>
                <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap text-xs">
                  {JSON.stringify(lesson.content,null,2)}
                </pre>
              </details>)}
            </div>
          </div>)}
        </article>)}
      </section>}
    </div>
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
      {categories.map(kind=><div key={kind} className="border border-border p-2 text-xs">
        <strong className="capitalize">{kind}</strong>
        <p className="mt-1 text-muted-foreground">
          {item.reviews.find(r=>r.kind===kind)?.decision??"Not reviewed"}
        </p>
      </div>)}
    </div>
    {!item.offeringPublished&&
      <NativeOfferingReleasePolicyEditor offeringVersionId={item.offeringVersionId}/>}
    {item.status==="draft"&&!item.offeringPublished&&<form className="mt-4 grid gap-3 sm:grid-cols-2"
      onSubmit={submit}>
      <Field label="Review category"><Select value={category}
        onChange={event=>setCategory(event.target.value as typeof category)}>
        {categories.map(kind=><option key={kind} value={kind}>{kind}</option>)}
      </Select></Field>
      <Field label="Decision"><Select value={decision}
        onChange={event=>setDecision(event.target.value as typeof decision)}>
        <option value="rejected">Changes required</option>
        <option value="approved">Approve with evidence</option>
      </Select></Field>
      <Field label="Independent rationale" className="sm:col-span-2">
        <Textarea rows={2} required minLength={10} maxLength={2000}
          value={reason} onChange={event=>setReason(event.target.value)}/>
      </Field>
      <Field label={category==="rights"?"Verified rights evidence UUID":"Verified review evidence UUID"}
        className="sm:col-span-2">
        <Input value={evidence} required={decision==="approved"}
          onChange={event=>setEvidence(event.target.value)}/>
      </Field>
      <Button type="submit" disabled={!item.current||!content.isSuccess||feedback.pending||feedback.refreshFailed||reason.trim().length<10||
        decision==="approved"&&!evidence.trim()}>Record decision</Button>
    </form>}
    <div className="mt-4 flex flex-wrap gap-3">
      {!item.allCoursesPublished&&<Button variant="outline" type="button"
        disabled={!item.current||!fullyApproved||feedback.pending||feedback.refreshFailed}
        onClick={()=>void run(()=>publishNativeOfferingCourses({data:release}),
          "Approved native Course versions published.")}>Publish reviewed Courses</Button>}
      {!item.offeringPublished&&item.assetCount>0&&item.status==="draft"&&
        <Button variant="outline" type="button"
          disabled={!item.current||!fullyApproved||!item.releasePoliciesComplete||
            !content.isSuccess||feedback.pending||feedback.refreshFailed}
          onClick={()=>void run(()=>approveNativeOfferingAssetManifest({data:release}),
            "Exact asset-backed manifest approved after independent review.")}>
          Approve reviewed asset manifest
        </Button>}
      {!item.offeringPublished&&<Button variant="outline" type="button"
        disabled={!item.current||!fullyApproved||item.status!=="approved"||
          !item.releasePoliciesComplete||!item.allCoursesPublished||feedback.pending||feedback.refreshFailed}
        onClick={()=>void run(()=>publishNativeOfferingVersion({data:release}),
          "Offering published. Local adoption still requires independent approval.")}>
        Publish reviewed Offering</Button>}
    </div>
    {item.assetCount===0&&<p className="mt-3 text-xs text-muted-foreground">
      This submission covers the Course manuscript only. The publisher must
      attach currently approved immutable assets and resubmit for independent
      Offering release review.
    </p>}
    {!item.releasePoliciesComplete&&<p role="alert" className="mt-3 text-xs text-destructive">
      Release policy is incomplete. An independent publisher reviewer must save
      explicit requirements for every native Course before Offering release.
    </p>}
    {!fullyApproved&&<p className="mt-3 text-xs text-muted-foreground">
      Publication requires the latest independent academic, rights, accessibility,
      coverage and safety approvals with current verified evidence for this exact manifest.
    </p>}
    <MutationFeedback state={feedback} className="mt-3"
      pendingMessage="Validating independent Course review, release evidence and exact version…"/>
  </article>;
}

export function NativeOfferingReleaseReviewPanel(){
  const queue=useInfiniteQuery({
    queryKey:["native-offering-release-review-queue"],
    initialPageParam:null as {createdAt:string;id:string}|null,
    queryFn:({pageParam})=>getNativeOfferingReleaseReviewQueue({data:{cursor:pageParam}}),
    getNextPageParam:last=>last.nextCursor??undefined,
    retry:false,
  });
  const items=queue.data?.pages.flatMap(page=>page.items)??[];
  return <WorkspacePanel title="Native Course and Offering release"
    className="mt-6"
    description="Exact-version publisher review, without a parallel curriculum publisher or local adoption shortcut.">
    {queue.isPending&&<p role="status">Checking independently verified Course review appointments…</p>}
    {queue.isError&&!queue.data&&<WorkspaceNotice tone="danger">
      The native Course review queue is unavailable for this verified reviewer account.
    </WorkspaceNotice>}
    {queue.isFetchNextPageError&&<WorkspaceNotice tone="danger">
      Older review submissions could not be loaded. Retry without repeating approval actions.
    </WorkspaceNotice>}
    {queue.isSuccess&&items.length===0&&!queue.hasNextPage&&<EmptyState
      title="No eligible native Offering submissions"
      description="Only Course-appointed reviewers can see submitted versions. A general Organization role does not grant Course review authority."
    />}
    {queue.isSuccess&&items.length===0&&queue.hasNextPage&&<p role="status" className="mt-3 text-sm text-muted-foreground">
      No independently authorized submissions appeared in the loaded page. Older records may still contain eligible work.
    </p>}
    <div className="mt-4 grid gap-4">
      {items.map(item=><ReleaseReview item={item} key={item.id}/>)}
      {queue.hasNextPage&&<Button type="button" variant="outline"
        disabled={queue.isFetchingNextPage} onClick={()=>void queue.fetchNextPage()}>
        {queue.isFetchingNextPage?"Loading older submissions…":"Load older review submissions"}
      </Button>}
    </div>
  </WorkspacePanel>;
}

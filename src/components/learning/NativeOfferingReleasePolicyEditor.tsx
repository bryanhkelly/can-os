import { useEffect, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { normalizeClientError } from "@/lib/client-error";
import {
  getNativeOfferingReleasePolicyReview,saveNativeOfferingReleasePolicy,
} from "@/modules/learning/native-offering-release.functions";

type DraftPolicy={minimum:string;coverage:boolean};

/** One policy per native Course, independently reviewed by an appointed
 * publisher reviewer. Missing rules never silently default to zero in the DB. */
export function NativeOfferingReleasePolicyEditor({
  offeringVersionId,
}:{offeringVersionId:string}){
  const client=useQueryClient();
  const query=useQuery({
    queryKey:["native-offering-release-policy",offeringVersionId],
    queryFn:()=>getNativeOfferingReleasePolicyReview({data:{offeringVersionId}}),
    retry:false,
  });
  const [drafts,setDrafts]=useState<Record<string,DraftPolicy>>({});
  const [evidenceVersionId,setEvidenceVersionId]=useState("");
  const [rationale,setRationale]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  useEffect(()=>{
    if(!query.data)return;
    setDrafts(Object.fromEntries(query.data.courses.map(course=>{
      const recorded=query.data!.policies.find(policy=>
        policy.courseVersionId===course.courseVersionId);
      return [course.courseVersionId,{
        minimum:String(recorded?.minimumApprovedPrimaryTracks??1),
        coverage:recorded?.completeLessonCoverageRequired??true,
      }];
    })));
  },[query.dataUpdatedAt]);
  async function save(event:FormEvent){
    event.preventDefault();setError("");setNotice("");
    if(!query.data||query.data.lifecycle!=="draft"||busy)return;
    const requirements=query.data.courses.map(course=>{
      const draft=drafts[course.courseVersionId];
      return {
        courseVersionId:course.courseVersionId,
        minimumApprovedPrimaryTracks:Number(draft?.minimum??"1"),
        completeLessonCoverageRequired:draft?.coverage??true,
        independentAcademicReviewRequired:true as const,
        rightsClearanceRequired:true as const,
        accessibilityReviewRequired:true as const,
      };
    });
    if(requirements.some(item=>!Number.isInteger(item.minimumApprovedPrimaryTracks)||
      item.minimumApprovedPrimaryTracks<0||item.minimumApprovedPrimaryTracks>10||
      item.completeLessonCoverageRequired&&item.minimumApprovedPrimaryTracks<1)){
      setError("Use 0 to 10 approved primary tracks per Course. Complete recorded lesson coverage requires at least one.");
      return;
    }
    setBusy(true);
    try{
      await saveNativeOfferingReleasePolicy({data:{
        offeringVersionId,expectedManuscriptHash:query.data.manuscriptHash,
        expectedPolicyRevision:query.data.revision,
        requirements,reviewEvidenceVersionId:evidenceVersionId.trim(),
        rationale:rationale.trim(),
      }});
      setNotice("Release policy saved with verified independent review evidence. Any asset-backed manifest submitted before this change needs fresh review.");
      await Promise.all([
        client.invalidateQueries({queryKey:["native-offering-release-policy",offeringVersionId]}),
        client.invalidateQueries({queryKey:["native-offering-release-review-queue"]}),
        client.invalidateQueries({queryKey:["native-offering-release-overview",offeringVersionId]}),
      ]);
    }catch(cause){
      setError(normalizeClientError(cause,
        "Release policy was not saved. Verify your independent Course review appointment and current evidence.").message);
    }finally{setBusy(false)}
  }
  return <section className="mt-4 border border-border p-4" aria-label="Native Offering release requirements">
    <h4 className="font-semibold">Course release requirements</h4>
    <p className="mt-1 text-xs text-muted-foreground">
      Publisher-owned policy is independent of Course manuscript approval.
      Academic, rights and accessibility reviews are required for every Course.
      Changes are evidence-backed, audited and invalidate prior asset-backed snapshots.
    </p>
    {query.isPending&&<p role="status" className="mt-3 text-sm">Checking native Course policy…</p>}
    {query.isError&&<p role="alert" className="mt-3 text-sm text-destructive">
      Current policy is unavailable under your verified reviewer appointment.
    </p>}
    {query.data&&<form className="mt-4 grid gap-4" onSubmit={event=>void save(event)}>
      {query.data.courses.map(course=>{
        const current=drafts[course.courseVersionId];
        return <div key={course.courseVersionId} className="border border-border p-3">
          <h5 className="text-sm font-semibold">{course.courseTitle}
            {course.isRequired?" · Required Course":""}
          </h5>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Minimum approved recorded primary tracks">
              <Input type="number" min={0} max={10} step={1}
                value={current?.minimum??"1"}
                onChange={event=>setDrafts(items=>({
                  ...items,[course.courseVersionId]:{
                    minimum:event.target.value,coverage:current?.coverage??true,
                  },
                }))}/>
            </Field>
            <Field label="Require complete recorded lesson coverage">
              <Select value={(current?.coverage??true)?"yes":"no"}
                onChange={event=>setDrafts(items=>({
                  ...items,[course.courseVersionId]:{
                    minimum:current?.minimum??"1",coverage:event.target.value==="yes",
                  },
                }))}>
                <option value="yes">Yes, all lessons covered by a primary track</option>
                <option value="no">No, no recorded coverage requirement</option>
              </Select>
            </Field>
          </div>
        </div>;
      })}
      <Field label="Verified policy review evidence version UUID">
        <Input required value={evidenceVersionId}
          onChange={event=>setEvidenceVersionId(event.target.value)}
          placeholder="Independently verified evidence document version"/>
      </Field>
      <Field label="Policy rationale">
        <Textarea required minLength={10} maxLength={2000} rows={3}
          value={rationale} onChange={event=>setRationale(event.target.value)}
          placeholder="Explain the required recorded tracks and coverage decision"/>
      </Field>
      <div><Button type="submit" disabled={busy||query.data.lifecycle!=="draft"||
        !evidenceVersionId.trim()||rationale.trim().length<10}>
        {busy?"Saving independently reviewed policy…":"Save governed release requirements"}
      </Button></div>
    </form>}
    {notice&&<p role="status" className="mt-3 text-sm">{notice}</p>}
    {error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
  </section>;
}

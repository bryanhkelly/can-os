import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { WorkspaceShell } from "@/components/workspace";
import { CapabilityLabNav } from "@/components/capability-lab/CapabilityLabNav";
import { Button } from "@/components/ui/button";
import { CanonicalBlueprintLoadError } from "@/components/launch-studio/CanonicalBlueprintLoadError";
import { normalizeClientError } from "@/lib/client-error";
import { safeLoader } from "@/lib/safe-loader";
import {
  readCanonicalSurveyPublicationQueue, publishCanonicalSurveyVersion,
} from "@/modules/operations/canonical-survey-approvals.functions";

type Version=Awaited<ReturnType<typeof readCanonicalSurveyPublicationQueue>>["versions"][number];
export const Route=createFileRoute("/canonical/lab/survey-publications")({
  loader:()=>safeLoader(()=>readCanonicalSurveyPublicationQueue())(),
  component:PublisherPage,
});
function PublisherPage(){
  const result=Route.useLoaderData();
  if(!result.ok)return <CanonicalBlueprintLoadError title="Survey publication" message={result.message}/>;
  return <WorkspaceShell width="wide" eyebrow="Internal · Canonical v3.0.1"
    title="Survey publication"
    subtitle="Promote approved survey versions into immutable published content using the canonical publication gate.">
    <CapabilityLabNav current="survey-publications" surveyPublicationEnabled/>
    <section className="mt-6 border border-border bg-card p-5">
      <h2 className="text-base font-semibold">Publishing does not start a campaign</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        A version requires current independent privacy, accessibility and safeguarding approvals,
        plus at least one question. Publishing locks its content. It does not invite learners,
        create an operating campaign, authorize a Site or substitute for audience permission evidence.
      </p>
      <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
        Provider organization: {result.data.organizationId} · Up to {result.data.limit} draft versions
      </p>
    </section>
    <div className="mt-5 grid gap-4">
      {result.data.versions.map(v=><PublishCard key={v.id} version={v}/>)}
      {result.data.versions.length===0&&<p role="status" className="border border-border bg-card p-5 text-sm text-muted-foreground">
        No active draft survey versions in this organization.
      </p>}
    </div>
  </WorkspaceShell>;
}
function PublishCard({version}:{version:Version}){
  const router=useRouter();
  const [confirmed,setConfirmed]=useState(false);
  const [busy,setBusy]=useState(false);
  const [feedback,setFeedback]=useState<{error:boolean;text:string}|null>(null);
  async function publish(){
    if(!confirmed||busy||!version.publicationReady)return;
    setBusy(true);setFeedback(null);
    try{
      await publishCanonicalSurveyVersion({data:{surveyVersionId:version.id}});
      setFeedback({error:false,text:"Survey version published. Refreshing the draft list."});
      setConfirmed(false);
      await router.invalidate();
    }catch(cause){
      setFeedback({error:true,text:normalizeClientError(cause,"Publication was rejected.").message});
    }finally{setBusy(false);}
  }
  return <article className="border border-border bg-card p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-serif text-2xl">{version.title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{version.code} · Version {version.versionNo} · {version.questionCount} questions</p>
        <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{version.id}</p>
      </div>
      <span className="border border-border px-3 py-2 text-xs font-medium">
        {version.publicationReady?"Approval gate ready":"Approval gate incomplete"}
      </span>
    </div>
    <div className="mt-4 grid gap-2 sm:grid-cols-3">
      {version.approvals.map(row=><div key={row.kind} className="border border-border p-3 text-sm">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{row.kind}</p>
        <p className="mt-1 font-medium">
          {row.decision??"Missing"}{!row.independent&&row.decision?" · Invalid reviewer":""}
          {row.decision==="approved"&&!row.evidenceCurrent?" · Evidence invalid":""}
        </p>
      </div>)}
    </div>
    <label className="mt-5 flex items-start gap-3 border-t border-border pt-4 text-sm">
      <input type="checkbox" className="mt-1 size-4 accent-primary" checked={confirmed}
        onChange={e=>setConfirmed(e.target.checked)} disabled={busy||!version.publicationReady}/>
      I understand publication makes this version immutable. I have confirmed the independent approvals.
    </label>
    {feedback&&<p role={feedback.error?"alert":"status"} className={
      "mt-3 border p-3 text-sm "+(feedback.error?"border-destructive text-destructive":"border-border")
    }>{feedback.text}</p>}
    <Button className="mt-4" type="button" disabled={busy||!confirmed||!version.publicationReady}
      onClick={()=>void publish()}>{busy?"Publishing…":"Publish approved version"}</Button>
  </article>;
}

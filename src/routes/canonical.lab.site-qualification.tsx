import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { DirectoryTable } from "@/components/workspace";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import {useState, type FormEvent} from "react";
import { WorkspaceShell } from "@/components/workspace";
import { CapabilityLabNav } from "@/components/capability-lab/CapabilityLabNav";
import { CanonicalBlueprintLoadError } from "@/components/launch-studio/CanonicalBlueprintLoadError";
import { safeLoader } from "@/lib/safe-loader";
import { getCanonicalQualificationLab,recordSiteQualificationResourceNeed } from "@/modules/operations/canonical-qualification-lab.functions";
import {Button} from "@/components/ui/button";

export const Route = createFileRoute("/canonical/lab/site-qualification")({
  loader: () => safeLoader(() => getCanonicalQualificationLab())(),
  component: QualificationLabPage,
});

function QualificationLabPage() {
  const result = Route.useLoaderData();
  if (!result.ok) return <CanonicalBlueprintLoadError title="Site qualification" message={result.message}/>;
  const { applications, limit } = result.data;
  return <WorkspaceShell width="wide" eyebrow="Internal · Canonical v3.0.1"
    title="Site qualification"
    subtitle="Inspect site qualification applications, program-fit evidence summaries and latest review recommendations.">
    <CapabilityLabNav current="site-qualification"/>
    <p className="mt-4 text-sm text-muted-foreground">
      Site readiness and resource observations use the approved qualification assessment,
      not a fixed list of survey questions. Reported needs require separate evidence
      verification before they can appear in a funding brief.
    </p>
    <section className="mt-6 border border-border bg-card p-5">
      <h2 className="text-base font-semibold">No implied approval</h2>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        Showing up to {limit} site or proposed-site applications owned by your canonical organization,
        limited to authorized Sites where a Site is assigned. Counts use the latest recorded
        determination for each requirement. A recommendation is not a site opening authorization,
        safety certification or final compliance approval. Evidence bodies and applicant contact
        details are not exposed.
      </p>
    </section>
    <DirectoryTable label="Site qualification applications"
      caption="Authorized site qualification observations; a recommendation is not approval."
      rows={applications} rowKey={row=>row.id}
      empty={<p className="p-4 text-sm text-muted-foreground">No site qualification applications in this authorized scope.</p>}
      columns={[
        {id:"application",title:"Application / Site",render:row=><>
          {row.subjectKind==="proposed_site"?"Proposed site":"Site"} · {row.status}
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{row.siteId??"No canonical Site attached"}</p>
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">Application {row.id}</p>
        </>},
        {id:"population",title:"Population",render:row=>row.intendedPopulation},
        {id:"fit",title:"Program fit",render:row=><>{row.assessmentCount} assessment(s)
          <p className="mt-1 text-xs text-muted-foreground">{row.latestDeliveryContext??"No fit assessment"} · {row.latestPopulation??"Not assessed"}</p>
          {row.policyVersionId&&<p className="mt-1 break-all font-mono text-xs text-muted-foreground">Policy version {row.policyVersionId}</p>}
        </>},
        {id:"observations",title:"Requirement observations",render:row=><>
          {row.requirementsObserved} observed · {row.satisfied} satisfied
          <p className="mt-1 text-xs text-muted-foreground">{row.deficient} deficient · {row.pending} pending</p>
          <p className="mt-1 text-xs text-muted-foreground">{row.verified} verified · {row.evidenceLinked} evidence-linked</p>
        </>},
        {id:"recommendation",title:"Review recommendation",render:row=>row.latestReviewOutcome??"No review recorded"},
        {id:"resources",title:"Resources / device gaps",render:row=><>
          {row.resources.length>0?<ul className="space-y-2">{row.resources.map(need=><li key={need.id}>
            <strong className="block">{need.description}</strong>
            <span className="text-xs">{need.requiredQuantity} needed · {need.availableQuantity} available · {need.shortageQuantity} unmet {need.unitCode} · {need.status}</span>
            {need.estimatedUnmetCostCents!==null&&
              <span className="block text-xs">Estimated unmet cost: {(need.estimatedUnmetCostCents/100).toLocaleString("en-US",{style:"currency",currency:"USD"})}</span>}
            {!need.evidenceVersionId&&<span className="block text-xs text-warning">No linked evidence · self-reported only</span>}
          </li>)}</ul>:<span className="text-xs text-muted-foreground">No resource needs recorded</span>}
          {row.latestAssessmentId&&row.siteId&&<SiteResourceNeedForm assessmentId={row.latestAssessmentId}/>}
        </>},
      ]}/>
  </WorkspaceShell>;
}

function SiteResourceNeedForm({assessmentId}:{assessmentId:string}){
  const router=useRouter();
  const [open,setOpen]=useState(false);
  const [code,setCode]=useState("");
  const [description,setDescription]=useState("");
  const [unit,setUnit]=useState("devices");
  const [required,setRequired]=useState("0");
  const [available,setAvailable]=useState("0");
  const [cost,setCost]=useState("");
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  async function submit(event:FormEvent){
    event.preventDefault();
    if(busy)return;setBusy(true);setNotice("");
    try{
      await recordSiteQualificationResourceNeed({data:{
        assessmentId,resourceCode:code.trim().toLowerCase(),
        description:description.trim(),unitCode:unit.trim().toLowerCase(),
        requiredQuantity:Number(required),availableQuantity:Number(available),
        estimatedUnitCostCents:cost.trim()?Math.round(Number(cost)*100):null,
      }});
      setOpen(false);setCode("");setDescription("");setCost("");
      await router.invalidate();
      setNotice("Resource need recorded as self-reported, pending independent verification.");
    }catch(e){setNotice(e instanceof Error?e.message:"Unable to save the resource observation.");}
    finally{setBusy(false);}
  }
  return <div className="mt-3">
    <Button variant="ghost" type="button" className="text-xs font-semibold text-primary underline"
      onClick={()=>setOpen(!open)}>{open?"Cancel entry":"Record equipment or connectivity need"}</Button>
    {notice&&<p role="status" className="mt-2 text-xs">{notice}</p>}
    {open&&<form className="mt-3 space-y-3 border border-border p-3 text-xs" onSubmit={e=>void submit(e)}>
      <p>Record a need for this Site assessment. Questionnaires, qualification approval and evidence review remain separate governed processes.</p>
      <Label className="block">Resource code
        <Input required minLength={2} maxLength={64} pattern="[a-z][a-z0-9_]*" value={code}
          onChange={e=>setCode(e.target.value)} placeholder="e.g. learner_laptops"
          className="mt-1 w-full border border-border bg-background p-2"/></Label>
      <Label className="block">Resource description
        <Input required minLength={5} maxLength={500} value={description}
          onChange={e=>setDescription(e.target.value)} placeholder="Laptops for participating learners"
          className="mt-1 w-full border border-border bg-background p-2"/></Label>
      <Label className="block">Measurement unit
        <Input required value={unit} maxLength={40} onChange={e=>setUnit(e.target.value)}
          className="mt-1 w-full border border-border bg-background p-2"/></Label>
      <div className="grid grid-cols-2 gap-2">
        <Label>Required<Input type="number" min="0" max="1000000" step="any" required value={required} onChange={e=>setRequired(e.target.value)}
          className="mt-1 w-full border border-border bg-background p-2"/></Label>
        <Label>Available<Input type="number" min="0" max="1000000" step="any" required value={available} onChange={e=>setAvailable(e.target.value)}
          className="mt-1 w-full border border-border bg-background p-2"/></Label>
      </div>
      <Label className="block">Estimated cost per additional unit (USD, optional)
        <Input type="number" min="0" max="10000000" step=".01" value={cost} onChange={e=>setCost(e.target.value)}
          className="mt-1 w-full border border-border bg-background p-2"/></Label>
      <Button size="sm" type="submit" disabled={busy}>{busy?"Recording…":"Record self-reported need"}</Button>
    </form>}
  </div>;
}

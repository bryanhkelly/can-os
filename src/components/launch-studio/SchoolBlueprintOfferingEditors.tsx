import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  updateSchoolBlueprintProgramPlan, retireSchoolBlueprintProgramPlan,
  updateSchoolBlueprintItem, retireSchoolBlueprintItem,
} from "@/modules/programs/school-blueprint.functions";
import {
  linkApprovedBlueprintProgram, prepareApprovedBlueprintActivity,
} from "@/modules/programs/school-blueprint-promotion.functions";
import type { getSiteBlueprintWorkspace } from "@/modules/programs/school-blueprint.functions";

type Workspace=Awaited<ReturnType<typeof getSiteBlueprintWorkspace>>;
type Program=Workspace["programs"][number];
type Item=Workspace["items"][number];
type Props={siteId:string;workspace:Workspace;onChanged:()=>Promise<void>};
function usePlanOperation(onChanged:()=>Promise<void>){
  const [busy,setBusy]=useState(false),[error,setError]=useState(""),[notice,setNotice]=useState("");
  const run=async(callback:()=>Promise<void>)=>{
    setBusy(true);setError("");setNotice("");
    try{await callback();await onChanged();setNotice("Saved. A new CAN review is required for changed proposals.");}
    catch(e){setError(e instanceof Error?e.message:"Unable to save the proposed offering.");}
    finally{setBusy(false);}
  };
  return {busy,error,notice,run};
}
export function BlueprintProgramEditor({siteId,workspace,program,onChanged}:Props&{program:Program}){
  const [name,setName]=useState(program.name);
  const [min,setMin]=useState(program.gradeRange.min??"6");
  const [max,setMax]=useState(program.gradeRange.max??"8");
  const [onsite,setOnsite]=useState(Boolean(program.deliveryModel.onsite));
  const [asyncMode,setAsyncMode]=useState(Boolean(program.deliveryModel.asynchronous));
  const [online,setOnline]=useState(Boolean(program.deliveryModel.liveOnline));
  const [days,setDays]=useState(Number(program.deliveryModel.onsiteDaysPerWeek??0));
  const [canonicalId,setCanonicalId]=useState("");
  const {busy,error,notice,run}=usePlanOperation(onChanged);
  const approved=workspace.approvedDecisions.some(d=>d.subjectKind==="program"&&d.subjectId===program.id&&d.decision==="approved");
  return <article className="border p-4 space-y-3">
    <div><h4 className="font-semibold">{program.name}</h4>
      <p className="text-xs text-muted-foreground">{program.kind} · {program.status}
        {approved?" · Previously reviewed by CAN":""}</p>
    </div>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice&&<p role="status" className="text-sm">{notice}</p>}
    {program.canonicalProgramId
      ? <p className="text-sm">Linked to operational Program. Further changes belong in Prepare Academics.</p>
      : <>
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-3"><Label htmlFor={"blueprint-name-"+program.id}>Proposed Program name</Label>
            <Input id={"blueprint-name-"+program.id} value={name} maxLength={120}
              onChange={e=>setName(e.target.value)} /></div>
          <div><Label htmlFor={"blueprint-min-"+program.id}>First grade</Label>
            <Input id={"blueprint-min-"+program.id} value={min} onChange={e=>setMin(e.target.value)}/></div>
          <div><Label htmlFor={"blueprint-max-"+program.id}>Last grade</Label>
            <Input id={"blueprint-max-"+program.id} value={max} onChange={e=>setMax(e.target.value)}/></div>
          <div><Label htmlFor={"blueprint-days-"+program.id}>Onsite days / week</Label>
            <Input id={"blueprint-days-"+program.id} type="number" min={0} max={7}
              value={days} onChange={e=>setDays(Number(e.target.value))}/></div>
        </div>
        <fieldset className="border p-3 space-y-2"><legend className="px-1 text-xs font-semibold">Planned instructional delivery</legend>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={onsite}
            onChange={e=>setOnsite(e.target.checked)}/>Onsite</label>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={asyncMode}
            onChange={e=>setAsyncMode(e.target.checked)}/>Asynchronous</label>
          <label className="flex gap-2 text-sm"><input type="checkbox" checked={online}
            onChange={e=>setOnline(e.target.checked)}/>Live online</label>
        </fieldset>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={()=>void run(async()=>{
            await updateSchoolBlueprintProgramPlan({data:{siteId,planId:program.id,
              expectedRevision:workspace.revision,name,gradeRange:{min,max},
              deliveryModel:{onsite,asynchronous:asyncMode,liveOnline:online,onsiteDaysPerWeek:days}}});
          })}>Save proposal</Button>
          <Button variant="ghost" disabled={busy} onClick={()=>void run(async()=>{
            await retireSchoolBlueprintProgramPlan({data:{siteId,planId:program.id,
              expectedRevision:workspace.revision}});
          })}>Remove from Blueprint</Button>
        </div>
        {approved&&<div className="border-t pt-3 space-y-2">
          <p className="text-sm font-medium">Link to the canonical Program</p>
          <p className="text-xs text-muted-foreground">
            Create the actual Program through Prepare Academics first.
            CAN's approval alone does not grant opening, credit or enrollment rights.
          </p>
          <Select aria-label={"Matching Program for "+program.name}
            value={canonicalId} onChange={e=>setCanonicalId(e.target.value)}>
            <option value="">Select a school Program…</option>
            {workspace.operationalPrograms.map(p=><option key={p.id} value={p.id}>
              {p.name} · {p.status}
            </option>)}
          </Select>
          <Button variant="outline" disabled={busy||!canonicalId} onClick={()=>void run(async()=>{
            await linkApprovedBlueprintProgram({data:{siteId,planId:program.id,programId:canonicalId,
              expectedRevision:workspace.revision}});
          })}>Connect approved plan to Program</Button>
        </div>}
      </>}
  </article>;
}
export function BlueprintItemEditor({siteId,workspace,item,onChanged}:Props&{item:Item}){
  const [title,setTitle]=useState(item.title),[summary,setSummary]=useState(item.summary);
  const prep=item.preparation;
  const initial=(key:string)=>typeof prep[key]==="string"?String(prep[key]):"";
  const [facilityPlan,setFacilityPlan]=useState(initial("facilityPlan"));
  const [staffingPlan,setStaffingPlan]=useState(initial("staffingPlan"));
  const [equipment,setEquipment]=useState(initial("equipment"));
  const [facilityDoc,setFacilityDoc]=useState(initial("facilityEvidenceDocumentId"));
  const [staffingDoc,setStaffingDoc]=useState(initial("staffingEvidenceDocumentId"));
  const [selectedProgram,setSelectedProgram]=useState("");
  const {busy,error,notice,run}=usePlanOperation(onChanged);
  const approved=workspace.approvedDecisions.some(d=>d.subjectKind==="item"&&d.subjectId===item.id&&d.decision==="approved");
  return <article className="border p-4 space-y-3">
    <div><h4 className="font-semibold">{item.title}</h4>
      <p className="text-xs text-muted-foreground">{item.kind} · {item.status}
        {approved?" · Previously reviewed by CAN":""}</p></div>
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice&&<p role="status" className="text-sm">{notice}</p>}
    {item.canonicalActivityId?<p className="text-sm">Prepared as an operational Activity; no registration was opened.</p>:
      <>
        <Label htmlFor={"blueprint-item-title-"+item.id}>Proposed name</Label>
        <Input id={"blueprint-item-title-"+item.id} value={title} maxLength={160}
          onChange={e=>setTitle(e.target.value)}/>
        <Label htmlFor={"blueprint-item-summary-"+item.id}>Family-friendly description</Label>
        <Textarea id={"blueprint-item-summary-"+item.id} value={summary} maxLength={4000}
          onChange={e=>setSummary(e.target.value)}/>
        <Label htmlFor={"blueprint-facility-"+item.id}>Room, facilities and safety plan</Label>
        <Textarea id={"blueprint-facility-"+item.id} value={facilityPlan} maxLength={2000}
          onChange={e=>setFacilityPlan(e.target.value)}
          placeholder="Example: painting requires documented ventilation and appropriate materials storage."/>
        <Label htmlFor={"blueprint-staffing-"+item.id}>Staffing and supervision plan</Label>
        <Textarea id={"blueprint-staffing-"+item.id} value={staffingPlan} maxLength={2000}
          onChange={e=>setStaffingPlan(e.target.value)}/>
        <Label htmlFor={"blueprint-equipment-"+item.id}>Required equipment</Label>
        <Textarea id={"blueprint-equipment-"+item.id} value={equipment} maxLength={1500}
          onChange={e=>setEquipment(e.target.value)}/>
        <div className="grid gap-3 sm:grid-cols-2">
          <div><Label htmlFor={"blueprint-facility-doc-"+item.id}>Facility evidence document ID (if available)</Label>
            <Input id={"blueprint-facility-doc-"+item.id} value={facilityDoc}
              onChange={e=>setFacilityDoc(e.target.value)} placeholder="Verified document UUID"/></div>
          <div><Label htmlFor={"blueprint-staffing-doc-"+item.id}>Staffing evidence document ID (if available)</Label>
            <Input id={"blueprint-staffing-doc-"+item.id} value={staffingDoc}
              onChange={e=>setStaffingDoc(e.target.value)} placeholder="Verified document UUID"/></div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={()=>void run(async()=>{
            await updateSchoolBlueprintItem({data:{siteId,itemId:item.id,
              expectedRevision:workspace.revision,title,summary,
              preparation:{facilityPlan,staffingPlan,equipment,
                facilityEvidenceDocumentId:facilityDoc||null,
                staffingEvidenceDocumentId:staffingDoc||null}}});
          })}>Save facilities and staffing plan</Button>
          <Button variant="ghost" disabled={busy} onClick={()=>void run(async()=>{
            await retireSchoolBlueprintItem({data:{siteId,itemId:item.id,
              expectedRevision:workspace.revision}});
          })}>Remove from Blueprint</Button>
        </div>
        {approved&&<div className="border-t pt-3 space-y-2">
          <p className="text-sm font-medium">Prepare the CAN-approved Activity</p>
          <p className="text-xs text-muted-foreground">
            Creates an Activity record without a Season, registration or student access.
            The most recent approved version must still match this proposal.
          </p>
          <Select aria-label={"Academic Program association for "+item.title} value={selectedProgram}
            onChange={e=>setSelectedProgram(e.target.value)}>
            <option value="">Site-level Activity (no Program association)</option>
            {workspace.operationalPrograms.map(p=><option key={p.id} value={p.id}>
              {p.name} · {p.status}</option>)}
          </Select>
          <Button variant="outline" disabled={busy} onClick={()=>void run(async()=>{
            await prepareApprovedBlueprintActivity({data:{
              siteId,itemId:item.id,expectedRevision:workspace.revision,
              programId:selectedProgram||null}});
          })}>Prepare approved Activity</Button>
        </div>}
      </>}
  </article>;
}

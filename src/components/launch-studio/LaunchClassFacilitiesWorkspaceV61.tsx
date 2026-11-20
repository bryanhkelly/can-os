import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { WorkspaceNotice, WorkspacePanel } from "@/components/workspace";
import {
  readLaunchClassFacilitiesV61, saveLaunchClassPhysicalPlanV61,
} from "@/modules/classes/launch-class-facilities.functions";
import { assignNativeClassStaff } from "@/modules/classes/class-staff.functions";
import { roomPlanningFitsClass } from "@/domain/launch-facilities-v61";
import { useLaunchUnsavedChanges } from "./useLaunchUnsavedChanges";

type Snapshot=Awaited<ReturnType<typeof readLaunchClassFacilitiesV61>>;
type ClassPlan=Snapshot["classes"][number];

function ClassPhysicalForm({plan,workspace,onChanged}:{
  plan:ClassPlan;workspace:Snapshot;onChanged:()=>Promise<unknown>;
}){
  const [spaceId,setSpaceId]=useState(plan.physicalSpaceId??"");
  const [assignmentId,setAssignmentId]=useState(plan.primaryFacilitatorAssignmentId??"");
  const [newFacilitatorId,setNewFacilitatorId]=useState("");
  const [busy,setBusy]=useState(false);
  const [uncertain,setUncertain]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const editable=plan.state==="draft"||plan.state==="approved";
  const changed=spaceId!==(plan.physicalSpaceId??"")||
    assignmentId!==(plan.primaryFacilitatorAssignmentId??"");
  const currentSpace=workspace.spaces.find(space=>space.id===spaceId);
  const capacityFits=!!currentSpace&&roomPlanningFitsClass(plan.capacity,currentSpace.maxOccupancy);
  useLaunchUnsavedChanges(changed||busy||uncertain,
    "Leave Schedules & Capacity? Unsaved Class room assignments will be lost.");
  async function refreshAfterCommand(){
    try{await onChanged();}catch{
      setUncertain(true);
      setError("The write may have succeeded, but refresh failed. Reload the Class record before repeating.");
    }
  }
  async function save(){
    if(!editable||busy||uncertain||!changed)return;
    if(spaceId&&!capacityFits){
      setError("Choose a room with a recorded capacity at least as large as the Class.");
      return;
    }
    setBusy(true);setError("");setNotice("");
    try{
      await saveLaunchClassPhysicalPlanV61({data:{
        siteId:workspace.siteId,classId:plan.classId,
        spaceId:spaceId||null,facilitatorAssignmentId:spaceId?(assignmentId||null):null,
        expectedRevision:plan.revision,
      }});
      await refreshAfterCommand();
      setNotice("Class physical room plan saved. Session-specific staffing and readiness remain separate.");
    }catch{
      setUncertain(true);
      setError("Save outcome cannot be verified. Reload the Class plan before retrying.");
    }finally{setBusy(false)}
  }
  async function addStaff(){
    if(!editable||busy||uncertain||!newFacilitatorId)return;
    setBusy(true);setError("");setNotice("");
    try{
      await assignNativeClassStaff({data:{
        classId:plan.classId,personId:newFacilitatorId,
        roleCode:"facilitator",canVerifyAttendance:false,
      }});
      await refreshAfterCommand();
      setNewFacilitatorId("");
      setNotice("Existing verified Site facilitator added to the Class staff roster.");
    }catch{
      setUncertain(true);
      setError("The assignment outcome requires a fresh Class read before retrying.");
    }finally{setBusy(false)}
  }
  return <div className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-2">
      <Label className="space-y-2">Physical room
        <Select value={spaceId} disabled={!editable||busy||uncertain}
          onChange={e=>{
            setSpaceId(e.target.value);
            if(!e.target.value)setAssignmentId("");
          }}>
          <option value="">No physical space selected</option>
          {workspace.spaces.map(space=><option key={space.id} value={space.id}
            disabled={space.maxOccupancy===null||
              !roomPlanningFitsClass(plan.capacity,space.maxOccupancy)}>
            {space.name} (capacity {space.maxOccupancy??"unknown"})
          </option>)}
        </Select>
      </Label>
      <Label className="space-y-2">Primary Class facilitator
        <Select value={assignmentId} disabled={!editable||busy||uncertain||!spaceId}
          onChange={e=>setAssignmentId(e.target.value)}>
          <option value="">Not assigned</option>
          {plan.staff.filter(staff=>staff.roleCode==="facilitator").map(staff=>
            <option key={staff.assignmentId} value={staff.assignmentId}>
              {staff.name}
            </option>)}
        </Select>
      </Label>
    </div>
    <p className="text-xs text-muted-foreground">
      Class seats: {plan.capacity??"not recorded"}.
      {" "}A physical space must have a known occupancy limit; a facilitator
      must first have an approved assignment to this Class.
      Neither selection proves room supervision at an individual Session.
    </p>
    {editable && <div className="flex flex-wrap items-end gap-3">
      <Label className="max-w-sm flex-1 space-y-2">Assign an accepted Site facilitator to this Class
        <Select value={newFacilitatorId} disabled={busy||uncertain}
          onChange={e=>setNewFacilitatorId(e.target.value)}>
          <option value="">Choose a verified Site facilitator</option>
          {workspace.facilitators.filter(person=>
            !plan.staff.some(staff=>staff.personId===person.personId&&staff.roleCode==="facilitator"))
            .map(person=><option key={person.personId} value={person.personId}>{person.name}</option>)}
        </Select>
      </Label>
      <Button type="button" variant="outline" disabled={!newFacilitatorId||busy||uncertain}
        onClick={()=>void addStaff()}>Assign to Class</Button>
    </div>}
    {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
    {notice&&<p role="status" className="text-sm text-muted-foreground">{notice}</p>}
    {editable && <Button type="button" disabled={!changed||busy||uncertain||Boolean(spaceId&&!capacityFits)}
      onClick={()=>void save()}>{busy?"Saving…":"Save Class room plan"}</Button>}
    {uncertain&&<Button type="button" variant="outline" className="ml-2"
      onClick={()=>void onChanged().then(()=>setUncertain(false)).catch(()=>
        setError("Class refresh remains unavailable."))}>
      Reload Class room plan
    </Button>}
    {!editable&&<p className="text-sm text-muted-foreground">
      Active or closed Class placements cannot be changed from Prepare.
      Use the authorized operational revision process.
    </p>}
  </div>;
}

/** Canonical Class placement. Uses the existing site_spaces and
 * class_staff_assignments owners, never Section-based room coverage. */
export function LaunchClassFacilitiesWorkspaceV61({siteId}:{siteId:string}){
  const query=useQuery({
    queryKey:["launch-v61-class-facilities",siteId],
    queryFn:()=>readLaunchClassFacilitiesV61({data:{siteId}}),
    retry:false,
  });
  const refresh=async()=>{await query.refetch({throwOnError:true})};
  const snapshot = query.data?.siteId === siteId ? query.data : null;
  return <WorkspacePanel title="Class rooms & facilitator assignments"
    description="Choose the actual Site room and a verified Class facilitator for each canonical Class. All changes use the original Class and staff records.">
    {query.isPending&&<p role="status" className="mt-3">Loading Class room assignments…</p>}
    {query.isError&&<div role="alert" className="mt-3 space-y-3">
      <p>Operational Class assignment is not available for this Site yet.
        A published Solution alone does not authorize a Class or its staff.</p>
      <Button type="button" variant="outline" onClick={()=>void query.refetch()}>
        Retry authorized Class read
      </Button>
    </div>}
    {snapshot && <>
      {!snapshot.classes.length&&<p className="mt-3 text-sm text-muted-foreground">
        No canonical Classes are available for this Site under its current
        approved Course adoption. Your private Solution plan remains saved.
      </p>}
      <div className="mt-4 space-y-3">
        {snapshot.classes.map(cls=><details key={cls.classId+":"+cls.revision}
          className="border bg-background p-4">
          <summary className="cursor-pointer text-sm font-semibold">
            {cls.title} · {cls.state} · Room:{" "}
            {snapshot.spaces.find(space=>space.id===cls.physicalSpaceId)?.name??"not assigned"}
          </summary>
          <div className="mt-4 border-t pt-4">
            <ClassPhysicalForm plan={cls} workspace={snapshot} onChanged={refresh}/>
          </div>
        </details>)}
      </div>
      <Button type="button" variant="outline" size="sm" className="mt-4"
        onClick={()=>void query.refetch()}>Refresh Class assignments</Button>
      {!snapshot.spaces.length && <p className="mt-3 text-sm text-muted-foreground">
        Register a room and its capacity in Facilities & Resources before assigning it here.
      </p>}
    </>}
    <WorkspaceNotice tone="info">
      This is a planning-level Class-to-space link, not authorization to open
      a classroom. Dated Sessions, presence, staff verification, room collision
      checks, and learner enrollment retain their independent controls.
    </WorkspaceNotice>
  </WorkspacePanel>;
}

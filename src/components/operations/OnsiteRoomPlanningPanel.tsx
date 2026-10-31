import { useCallback, useEffect, useState } from "react";
import { getOnsiteRoomPlanningFn, submitOnsiteRoomPlanFn, reviewOnsiteRoomPlanFn } from "@/modules/operations/onsite-room-plan.functions";

type Model = Awaited<ReturnType<typeof getOnsiteRoomPlanningFn>>;
type Block = Model["blocks"][number];

export function OnsiteRoomPlanningPanel({programId, initialDate, onChanged}:{
  programId:string; initialDate?:string; onChanged?:()=>void;
}) {
  const [date,setDate]=useState(initialDate??new Date().toISOString().slice(0,10));
  const [model,setModel]=useState<Model|null>(null);
  const [error,setError]=useState("");
  const [loading,setLoading]=useState(false);
  const load=useCallback(async()=>{
    setLoading(true);setError("");
    try{setModel(await getOnsiteRoomPlanningFn({data:{programId,date}}));}
    catch(cause){setModel(null);setError(cause instanceof Error?cause.message:"Room planning unavailable");}
    finally{setLoading(false);}
  },[programId,date]);
  useEffect(()=>{if(initialDate)setDate(initialDate);},[initialDate]);
  useEffect(()=>{void load();},[load]);
  return <section className="mt-6 rounded-xl border p-4" aria-label="Room and adult coverage planning">
    <h3 className="font-semibold">Room and adult coverage planning</h3>
    <p className="mt-2 text-sm text-muted-foreground">The church records the room, capacity and named adults for a real scheduled block. An independent CAN officer reviews the plan. This is a staff plan, not a legal inspection, permission to open or a record of physical arrival.</p>
    <label className="mt-3 block text-sm">School-local planning date
      <input type="date" value={date} onChange={event=>{setDate(event.target.value);setModel(null);}}
        className="ml-2 rounded border bg-background p-2"/>
    </label>
    <button type="button" onClick={()=>void load()} disabled={loading||!date} className="mt-2 text-sm underline">Refresh room plans</button>
    {loading&&<p role="status" className="mt-3 text-sm">Loading current schedule and eligible adults…</p>}
    {error&&<p role="alert" className="mt-3 text-sm">{error}</p>}
    {model&&!loading&&<>
      <p className="mt-2 text-xs text-muted-foreground">Schedule timezone: {model.timezone}. Adult choices require current Section appointments, screening and training for the entire block.</p>
      {!model.blocks.length&&<p className="mt-3 text-sm">No verified instructional blocks on this date. Check the school calendar and Section schedules.</p>}
      <div className="mt-3 space-y-3">{model.blocks.map(block=><RoomPlanBlock key={date+":"+block.sectionId+":"+block.periodId+":"+(block.current?.id??"none")}
        block={block} model={model} changed={async()=>{await load();onChanged?.();}}/>)}</div>
    </>}
  </section>;
}

function RoomPlanBlock({block,model,changed}:{block:Block;model:Model;changed:()=>Promise<void>}){
  const [documentId]=useState(()=>crypto.randomUUID());
  const [room,setRoom]=useState(block.current?.roomLabel??"");
  const [capacity,setCapacity]=useState(String(block.current?.roomCapacity??""));
  const [backup,setBackup]=useState(block.current?.backupPersonId??"");
  const [expiry,setExpiry]=useState("");
  const [rationale,setRationale]=useState("");
  const [reason,setReason]=useState("");
  const [busy,setBusy]=useState(false);
  const [saved,setSaved]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const primary=block.staff.find(row=>row.personId===block.assignedPrimaryPersonId);
  const scope={programId:model.programId,date:model.date,sectionId:block.sectionId,periodId:block.periodId};
  async function submit(){
    if(busy||saved||!primary)return;
    setBusy(true);setError("");setNotice("");
    try{
      await submitOnsiteRoomPlanFn({data:{...scope,documentId,expectedDocumentId:block.current?.id??null,
        primaryPersonId:primary.personId,backupPersonId:backup,roomLabel:room,roomCapacity:Number(capacity),
        expiresAt:new Date(expiry).toISOString(),rationale}});
      setSaved(true);setNotice("Plan submitted for independent CAN review. Staff arrival remains separate.");
      try{await changed();}catch{setNotice("Plan saved. Refresh room plans to see its current status.");}
    }catch(cause){setError(cause instanceof Error?cause.message:"Plan was not submitted");}
    finally{setBusy(false);}
  }
  async function review(decision:"approve"|"reject"){
    if(!block.current||busy||saved)return;
    setBusy(true);setError("");setNotice("");
    try{
      await reviewOnsiteRoomPlanFn({data:{...scope,documentId:block.current.id,decision,reason}});
      setSaved(true);setNotice(decision==="approve"?"Independent review recorded. Current supervision checks still apply.":"Rejected with correction instructions.");
      try{await changed();}catch{setNotice("Decision saved. Refresh room plans to see its current status.");}
    }catch(cause){setError(cause instanceof Error?cause.message:"Review was not saved");}
    finally{setBusy(false);}
  }
  return <article className="rounded-lg border p-3 text-sm">
    <h4 className="font-semibold">{block.title} · {block.periodLabel} · {block.startsAtLocal}–{block.endsAtLocal}</h4>
    {block.current&&<div className="mt-2 rounded border p-3">
      <p>Current plan: <strong>{block.current.status}</strong> · {block.current.roomLabel} · capacity {block.current.roomCapacity}</p>
      <p className="mt-1">Primary: {block.staff.find(row=>row.personId===block.current?.primaryPersonId)?.name??"Appointment or safety evidence no longer current"}</p>
      <p>Backup: {block.staff.find(row=>row.personId===block.current?.backupPersonId)?.name??"Appointment or safety evidence no longer current"}</p>
      <p className="mt-1 whitespace-pre-wrap">Plan rationale: {block.current.rationale}</p>
      {block.current.expiresAt&&<p className="mt-1">Validity ends: {new Date(block.current.expiresAt).toLocaleString()}</p>}
      {block.current.reason&&<p className="mt-2 whitespace-pre-wrap">Review: {block.current.reason}</p>}
    </div>}
    {model.canSubmit&&<details className="mt-3" open={!block.current}>
      <summary className="cursor-pointer font-medium">{block.current?"Submit a corrected or replacement plan":"Record a room coverage plan"}</summary>
      <p className="mt-2">Scheduled primary: {primary?.name??"No single eligible primary in the current delivery arrangement. Ask the school staffing administrator to correct it."}</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label>Room name<input value={room} maxLength={120} onChange={event=>setRoom(event.target.value)} className="mt-1 block w-full rounded border bg-background p-2"/></label>
        <label>Reviewed occupancy limit<input type="number" min={1} max={1000} value={capacity} onChange={event=>setCapacity(event.target.value)} className="mt-1 block w-full rounded border bg-background p-2"/></label>
        <label>Named qualified backup<select value={backup} onChange={event=>setBackup(event.target.value)} className="mt-1 block w-full rounded border bg-background p-2">
          <option value="">Choose an eligible Section adult</option>
          {block.staff.filter(row=>row.personId!==primary?.personId).map(row=><option key={row.personId} value={row.personId}>{row.name}</option>)}
        </select></label>
        <label>Plan validity ends (your browser timezone)<input type="datetime-local" value={expiry} onChange={event=>setExpiry(event.target.value)} className="mt-1 block w-full rounded border bg-background p-2"/></label>
      </div>
      <label className="mt-3 block">Basis for this room and adult plan<textarea value={rationale} maxLength={2000} onChange={event=>setRationale(event.target.value)} className="mt-1 block w-full rounded border bg-background p-2"/></label>
      <p className="mt-2 text-xs text-muted-foreground">Replacing the current plan immediately removes its coverage authorization until CAN reviews the new version.</p>
      <button type="button" disabled={busy||saved||!primary||!backup||!expiry||room.trim().length<2||rationale.trim().length<10}
        onClick={()=>void submit()} className="mt-3 rounded border px-3 py-2 disabled:opacity-50">Submit for independent review</button>
    </details>}
    {block.current?.canReview&&<div className="mt-3">
      <label>Independent review reason<textarea value={reason} maxLength={2000} onChange={event=>setReason(event.target.value)} className="mt-1 block w-full rounded border bg-background p-2"/></label>
      <div className="mt-2 flex gap-2">{(["approve","reject"] as const).map(decision=><button key={decision} type="button" disabled={busy||saved||reason.trim().length<10}
        onClick={()=>void review(decision)} className="rounded border px-3 py-2 disabled:opacity-50">{decision==="approve"?"Approve this plan":"Reject and request correction"}</button>)}</div>
    </div>}
    {notice&&<p role="status" className="mt-2">{notice}</p>}
    {error&&<p role="alert" className="mt-2">{error}</p>}
  </article>;
}

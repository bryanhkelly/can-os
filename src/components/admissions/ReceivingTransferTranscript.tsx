import { mutationErrorMessage } from "@/lib/mutation-feedback";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableHead, TableBody, TableRow, TableCell } from "@/components/ui/table";
import { WorkspaceNotice } from "@/components/workspace";
import { getReceivingSchoolTransferTranscript } from "@/modules/enrollment/transfer-records-handoff.functions";

export function ReceivingTransferTranscript({applicationId,consentRequested}:{
 applicationId:string;consentRequested:boolean;
}){
 const [busy,setBusy]=useState(false);
 const inFlight=useRef(false);
 const [error,setError]=useState("");
 const [result,setResult]=useState<Awaited<ReturnType<typeof getReceivingSchoolTransferTranscript>>|null>(null);
 async function open(){
  if(inFlight.current||!consentRequested)return;
  inFlight.current=true;
  setBusy(true);setError("");
  try{
   const record=await getReceivingSchoolTransferTranscript({data:{applicationId}});
   setResult(record);
  }catch(e){
   setResult(null);
   setError(mutationErrorMessage(e, "The receiving school is not authorized to view this transcript."));
  }finally{inFlight.current=false;setBusy(false);}
 }
 return <section className="mt-3  border bg-background p-3" aria-label="Released official transfer transcript">
  <h4 className="font-semibold">Originating school's official transcript</h4>
  <p className="mt-1 text-xs text-muted-foreground">
   Access requires the exact receiving-school Program grant, current guardian consent,
   a completed origin transfer, and an official issuer-recorded secure handoff.
   Every successful read is recorded in the institutional audit.
  </p>
  <Button type="button" variant="outline" size="sm" disabled={busy||!consentRequested}
   onClick={()=>void open()} className="mt-3  border px-3 py-2 text-xs font-semibold disabled:opacity-50">
   {busy?"Verifying authorization…":result?"Refresh authorized transcript":"View authorized official transcript"}
  </Button>
  {error&&<WorkspaceNotice tone="danger" className="mt-2">{error}</WorkspaceNotice>}
  {result&&<div className="mt-3 space-y-2">
   <p className="text-sm">Official issuance {result.issuanceId.slice(0,8)}
    {" "}· Issued {new Date(result.issuedAt).toLocaleDateString()}
    {" "}· Receiving school: {result.siteName}</p>
   {result.rows.length?
    <Table scrollLabel="Authorized official transcript" className="text-xs">
     <TableHeader><TableRow><TableHead className="p-2">Course</TableHead><TableHead className="p-2">School year</TableHead>
      <TableHead className="p-2">Term</TableHead><TableHead className="p-2">Grade</TableHead>
      <TableHead className="p-2">Attempted</TableHead><TableHead className="p-2">Earned</TableHead></TableRow></TableHeader>
     <TableBody>{result.rows.map((row,index)=><TableRow key={index} className="border-t">
      <TableCell className="p-2">{row.course}</TableCell><TableCell className="p-2">{row.schoolYear}</TableCell>
      <TableCell className="p-2">{row.term}</TableCell><TableCell className="p-2">{row.grade}</TableCell>
      <TableCell className="p-2">{row.creditsAttempted??"Not recorded"}</TableCell>
      <TableCell className="p-2">{row.creditsEarned??"Not recorded"}</TableCell>
     </TableRow>)}</TableBody></Table>:
     <p className="text-sm">The issued artifact contains no tabular course rows.</p>}
   <p className="text-xs text-muted-foreground">Official issuer snapshot is read-only.
     Review transfer credits independently; this does not award receiving-school credit.</p>
  </div>}
 </section>;
}

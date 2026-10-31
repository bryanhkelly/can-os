import { useState } from "react";
import { getReceivingSchoolTransferTranscript } from "@/modules/enrollment/transfer-records-handoff.functions";

export function ReceivingTransferTranscript({applicationId,consentRequested}:{
 applicationId:string;consentRequested:boolean;
}){
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState("");
 const [result,setResult]=useState<Awaited<ReturnType<typeof getReceivingSchoolTransferTranscript>>|null>(null);
 async function open(){
  if(busy||!consentRequested)return;
  setBusy(true);setError("");
  try{
   const record=await getReceivingSchoolTransferTranscript({data:{applicationId}});
   setResult(record);
  }catch(e){
   setResult(null);
   setError(e instanceof Error?e.message:"The receiving school is not authorized to view this transcript.");
  }finally{setBusy(false);}
 }
 return <section className="mt-3 rounded-lg border bg-background p-3" aria-label="Released official transfer transcript">
  <h4 className="font-semibold">Originating school's official transcript</h4>
  <p className="mt-1 text-xs text-muted-foreground">
   Access requires the exact receiving-school Program grant, current guardian consent,
   a completed origin transfer, and an official issuer-recorded secure handoff.
   Every successful read is recorded in the institutional audit.
  </p>
  <button type="button" disabled={busy||!consentRequested}
   onClick={()=>void open()} className="mt-3 rounded border px-3 py-2 text-xs font-semibold disabled:opacity-50">
   {busy?"Verifying authorization…":result?"Refresh authorized transcript":"View authorized official transcript"}
  </button>
  {error&&<p role="alert" className="mt-2 text-sm">{error}</p>}
  {result&&<div className="mt-3 space-y-2">
   <p className="text-sm">Official issuance {result.issuanceId.slice(0,8)}
    {" "}· Issued {new Date(result.issuedAt).toLocaleDateString()}
    {" "}· Receiving school: {result.siteName}</p>
   {result.rows.length?
    <div className="overflow-x-auto"><table className="w-full text-left text-xs">
     <thead><tr><th className="p-2">Course</th><th className="p-2">School year</th>
      <th className="p-2">Term</th><th className="p-2">Grade</th>
      <th className="p-2">Attempted</th><th className="p-2">Earned</th></tr></thead>
     <tbody>{result.rows.map((row,index)=><tr key={index} className="border-t">
      <td className="p-2">{row.course}</td><td className="p-2">{row.schoolYear}</td>
      <td className="p-2">{row.term}</td><td className="p-2">{row.grade}</td>
      <td className="p-2">{row.creditsAttempted??"Not recorded"}</td>
      <td className="p-2">{row.creditsEarned??"Not recorded"}</td>
     </tr>)}</tbody></table></div>:
     <p className="text-sm">The issued artifact contains no tabular course rows.</p>}
   <p className="text-xs text-muted-foreground">Official issuer snapshot is read-only.
     Review transfer credits independently; this does not award receiving-school credit.</p>
  </div>}
 </section>;
}

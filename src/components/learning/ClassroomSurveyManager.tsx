import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  attachClassroomSurvey,getClassroomSurveyOptions,
} from "@/modules/learning/classroom-surveys.functions";

type Stage="entry"|"pulse"|"exit";
export function ClassroomSurveyManager({facilitatedSessionId}:{
  facilitatedSessionId:string;
}){
  const campaigns=useQuery({
    queryKey:["classroom-governed-surveys",facilitatedSessionId],
    queryFn:()=>getClassroomSurveyOptions({data:{facilitatedSessionId}}),
    staleTime:0,refetchInterval:60_000,retry:false,
  });
  const [selected,setSelected]=useState("");
  const [stage,setStage]=useState<Stage>("exit");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  async function attach(){
    if(!selected||busy)return;
    setBusy(true);setError("");setMessage("");
    try{
      await attachClassroomSurvey({data:{
        facilitatedSessionId,surveyCampaignId:selected,stage,
      }});
      await campaigns.refetch();
      setMessage("Approved survey linked. Only personally invited, eligible learners can respond.");
    }catch{
      setError("Unable to link this survey. Check the campaign's current publication, permission evidence, invitation setup and deployment scope.");
    }finally{setBusy(false);}
  }
  return <section className="mt-4 border border-border bg-card p-4"
    aria-label="Governed classroom surveys">
    <h4 className="font-serif text-lg font-semibold">Approved session surveys</h4>
    <p className="mt-2 text-xs text-muted-foreground">
      Link a centrally governed identified survey for entry, pulse or exit
      feedback. Existing campaign permissions, published questions, invitations,
      consent and confidentiality rules remain authoritative. Answers are never
      copied into classroom activity or shown on the projector.
    </p>
    {campaigns.isPending&&<p role="status" className="mt-3 text-sm">
      Checking approved surveys…
    </p>}
    {campaigns.isError&&<p role="alert" className="mt-3 text-sm text-destructive">
      Approved survey campaigns could not be verified.
    </p>}
    {campaigns.isSuccess&&<div className="mt-4 grid gap-3 sm:grid-cols-2">
      <label className="text-sm font-medium">Approved campaign
        <select className="mt-2 min-h-10 w-full border border-border bg-background p-2"
          value={selected} onChange={e=>setSelected(e.target.value)}>
          <option value="">Choose a governed survey</option>
          {campaigns.data.campaigns.map(row=><option key={row.id} value={row.id}>
            {row.title}
          </option>)}
        </select>
      </label>
      <label className="text-sm font-medium">Session stage
        <select className="mt-2 min-h-10 w-full border border-border bg-background p-2"
          value={stage} onChange={e=>setStage(e.target.value as Stage)}>
          <option value="entry">Before instruction (entry)</option>
          <option value="pulse">During instruction (pulse)</option>
          <option value="exit">After instruction (exit)</option>
        </select>
      </label>
      <div className="sm:col-span-2">
        <Button type="button" size="sm" disabled={!selected||busy}
          onClick={()=>void attach()}>{busy?"Linking…":"Link approved survey"}</Button>
      </div>
    </div>}
    {campaigns.isSuccess&&!campaigns.data.campaigns.length&&
      <p role="status" className="mt-3 text-sm text-muted-foreground">
        No active, identified, permission-verified campaign is ready for
        this Deployment. Prepare and invite participants through the existing
        CAN survey workflow first.
      </p>}
    {campaigns.isSuccess&&!!campaigns.data.links.length&&
      <div className="mt-4 border-t border-border pt-3">
        <p className="text-sm font-medium">Linked to this room</p>
        {campaigns.data.links.map(link=><p key={link.surveyCampaignId+link.stage}
          className="mt-2 text-sm text-muted-foreground">
          {link.stage}: {campaigns.data.campaigns.find(row=>
            row.id===link.surveyCampaignId)?.title??"Previously approved campaign"}
        </p>)}
      </div>}
    {campaigns.isSuccess&&campaigns.data.partial&&
      <p role="status" className="mt-3 text-xs">Survey list limited to 100 entries.</p>}
    {error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
    {message&&<p role="status" className="mt-3 text-sm">{message}</p>}
  </section>;
}

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { normalizeClientError } from "@/lib/client-error";
import {
  getNativeClassSurveyCampaignOptions, linkNativeClassSurveyCampaign,
} from "@/modules/classes/native-class-survey-link.functions";

/** Associates an approved local canonical survey campaign with exactly one
 * Class before any invitations are sent. The same published survey Version
 * may be used by independent Sites through their own campaigns.
 */
export function NativeClassSurveyCampaignPanel({classId}:{classId:string}){
  const client=useQueryClient();
  const [selection,setSelection]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const query=useQuery({
    queryKey:["native-class-survey-campaigns",classId],
    queryFn:()=>getNativeClassSurveyCampaignOptions({data:{classId}}),
    retry:false,refetchOnReconnect:true,
  });
  const available=query.data?.campaigns.filter(row=>!row.linked)??[];
  async function link(){
    if(!selection||busy)return;
    setBusy(true);setError("");setNotice("");
    try{
      const result=await linkNativeClassSurveyCampaign({
        data:{classId,campaignId:selection},
      });
      setNotice(result.alreadyLinked?
        "That survey campaign was already attributed to this Class.":
        "The approved survey campaign is now attributed to this Class. Participant invitations and responses remain controlled by the canonical survey engine.");
      setSelection("");
      await client.invalidateQueries({queryKey:["native-class-survey-campaigns",classId]});
    }catch(cause){
      setError(normalizeClientError(cause,
        "Unable to attach the survey. The campaign must match this Class, have current verified permission, and have no prior invitations.").message);
    }finally{setBusy(false);}
  }
  return <section className="mt-5 border border-border bg-card p-5"
    aria-label="Class-specific feedback survey">
    <h2 className="font-serif text-xl">Feedback for this Class</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      A national publisher can reuse one approved Survey version, while each
      local Class must have its own identified campaign and consent authorization.
      Link the campaign before sending invitations. Other Sites' learner
      responses are not accessible here.
    </p>
    {query.isPending&&<p role="status" className="mt-3 text-sm">
      Checking approved local survey campaigns…
    </p>}
    {query.isError&&<p role="alert" className="mt-3 text-sm">
      Survey campaigns are unavailable to your current operator role or environment.
    </p>}
    {query.data&&<>
      {query.data.campaigns.filter(row=>row.linked).length>0&&
        <ul className="mt-4 divide-y divide-border border border-border">
          {query.data.campaigns.filter(row=>row.linked).map(row=>
            <li key={row.campaignId} className="p-3 text-sm">
              <span className="font-semibold">{row.title}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                Attributed · {row.status}
              </span>
            </li>)}
        </ul>}
      <label className="mt-4 block text-sm font-semibold" htmlFor="native-class-survey-campaign">
        Approved local campaign
      </label>
      <select id="native-class-survey-campaign" value={selection}
        onChange={event=>setSelection(event.target.value)}
        disabled={busy||available.length===0}
        className="mt-2 min-h-11 w-full border border-border bg-background px-3 text-sm">
        <option value="">Choose an unassigned approved campaign</option>
        {available.map(row=><option key={row.campaignId} value={row.campaignId}>
          {row.title} · {row.status}
        </option>)}
      </select>
      <Button type="button" className="mt-3" variant="outline"
        disabled={!selection||busy} onClick={()=>void link()}>
        {busy?"Linking…":"Link campaign to Class"}
      </Button>
      {available.length===0&&<p className="mt-3 text-xs text-muted-foreground">
        No unassigned, approved campaign is currently available. First create
        or approve a canonical survey and activate an identified local campaign
        with verified permission. This step does not create invitations.
      </p>}
    </>}
    {notice&&<p role="status" className="mt-3 text-sm">{notice}</p>}
    {error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
  </section>;
}

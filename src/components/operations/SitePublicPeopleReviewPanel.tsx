import {useEffect,useState} from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/choice";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import {
  listPublicSitePeopleReview,approveSitePeopleReview,
} from "@/modules/sites/site-public-people.functions";

type Review=Awaited<ReturnType<typeof listPublicSitePeopleReview>>;
export function SitePublicPeopleReviewPanel({siteId}:{siteId:string}) {
  const [data,setData]=useState<Review|null>(null);
  const [selected,setSelected]=useState<string[]>([]);
  const [reason,setReason]=useState("");
  const [reviewed,setReviewed]=useState(false);
  const [saving,setSaving]=useState(false);
  const [status,setStatus]=useState("");
  const [attempted,setAttempted]=useState(false);
  useEffect(()=>{
    let active=true;
    listPublicSitePeopleReview({data:{siteId}}).then(result=>{
      if(!active)return;
      setData(result);setSelected(result.approvedPersonIds);
    }).catch(()=>{if(active)setStatus("Unable to load staff review permissions.")});
    return ()=>{active=false};
  },[siteId]);
  async function approve(event:React.FormEvent){
    event.preventDefault();
    setAttempted(true);
    if(!data||!reviewed||reason.trim().length<10)return;
    setSaving(true);setStatus("");
    try{
      const result=await approveSitePeopleReview({data:{
        siteId,personIds:selected,expectedRevision:data.revision,
        reason,reviewed:true,
      }});
      setData({...data,revision:result.revision,approvedPersonIds:selected});
      setReason("");setReviewed(false);setAttempted(false);
      setStatus("Reviewed staff directory saved. Live permissions are rechecked before every public read.");
    }catch{setStatus("Unable to approve staff. Refresh to check current consent and publication revision.")}
    finally{setSaving(false)}
  }
  return <section aria-label="Public staff review" className="rounded-xl border bg-card p-5">
    <h2 className="font-serif text-xl">People families will meet</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Only people with active Site roles and their own current public biography consent appear.
      Private photos and employment information are never included.
    </p>
    {!data?<p role="status" className="mt-2 text-sm">{status||"Loading consented staff…"}</p>:
    <form noValidate onSubmit={approve} className="mt-4 space-y-3">
      {data.candidates.length===0&&<p className="text-sm">No staff biographies are consented for this Site.</p>}
      {data.candidates.map(person=><label key={person.personId}
        className="flex gap-3 rounded-lg border p-3 text-sm">
        <input type="checkbox" disabled={saving} checked={selected.includes(person.personId)}
          onChange={event=>{
            setReviewed(false);
            setSelected(previous=>event.target.checked
              ? [...previous,person.personId]
              : previous.filter(id=>id!==person.personId));
          }}/>
        <span><strong>{person.displayName} · {person.publicTitle}</strong>
          <span className="mt-1 block text-muted-foreground">{person.biography}</span>
          <span className="mt-1 block text-xs">Consent valid through {person.expiresOn}</span>
        </span>
      </label>)}
      <Field label="Institutional review reason" className="text-xs" required
        error={attempted&&reason.trim().length<10?"Enter at least 10 characters explaining this staff review.":undefined}>
        <Textarea value={reason} onChange={event=>setReason(event.target.value)} minLength={10} maxLength={500}/>
      </Field>
      <Field label="I reviewed the selected public biographies and their current permissions." required
        error={attempted&&!reviewed?"Confirm that you reviewed the selected biographies and permissions.":undefined}>
        <Checkbox checked={reviewed} onChange={event=>setReviewed(event.target.checked)} disabled={saving}/>
      </Field>
      <Button type="submit" disabled={saving}>
        {saving?"Saving approval…":"Approve selected biographies"}
      </Button>
      {status&&<p role="status" className="text-sm">{status}</p>}
    </form>}
  </section>;
}

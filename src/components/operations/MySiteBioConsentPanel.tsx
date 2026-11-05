import {useEffect,useState} from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  getMyPublicSiteBioConsent,changeMyPublicSiteBio,
} from "@/modules/sites/site-public-people.functions";

export function MySiteBioConsentPanel({siteId}:{siteId:string}) {
  const [displayName,setDisplayName]=useState("");
  const [publicTitle,setPublicTitle]=useState("");
  const [biography,setBiography]=useState("");
  const [expiresOn,setExpiresOn]=useState("");
  const [existing,setExisting]=useState(false);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [status,setStatus]=useState("");
  const [attempted,setAttempted]=useState(false);
  useEffect(()=>{
    let live=true;
    getMyPublicSiteBioConsent({data:{siteId}}).then(consent=>{
      if(!live)return;
      if(consent){
        setDisplayName(consent.displayName);
        setPublicTitle(consent.publicTitle);
        setBiography(consent.biography);
        setExpiresOn(consent.expiresOn);
        setExisting(true);
      }else{setExisting(false)}
      setLoading(false);
    }).catch(()=>{if(live){setStatus("Unable to load your Site role or biography permission.");setLoading(false)}});
    return ()=>{live=false};
  },[siteId]);
  async function save(event:React.FormEvent){
    event.preventDefault();setStatus("");setAttempted(true);
    if(displayName.trim().length<2||publicTitle.trim().length<2||biography.trim().length<30||!expiresOn)return;
    setSaving(true);
    try{
      await changeMyPublicSiteBio({data:{
        action:"consent",siteId,displayName,publicTitle,biography,expiresOn,
      }});
      setExisting(true);
      setAttempted(false);
      setStatus("Your Site biography permission was saved. Institutional approval is still required.");
    }catch{setStatus("Unable to save permission. Check your Site role and biography fields.")}
    finally{setSaving(false)}
  }
  async function revoke(){
    setSaving(true);setStatus("");
    try{
      await changeMyPublicSiteBio({data:{action:"revoke",siteId}});
      setExisting(false);
      setStatus("Your permission was withdrawn. The biography is no longer eligible for publication.");
    }catch{setStatus("Unable to withdraw permission. Please retry.")}
    finally{setSaving(false)}
  }
  return <section aria-label="My public Site biography" className="rounded-xl border bg-card p-5">
    <h2 className="font-serif text-xl">My public school biography</h2>
    <p className="mt-2 text-sm text-muted-foreground">
      Opt in to sharing only the name, title, and biography below on this school website.
      Your private profile photograph and contact details are not shared.
      You can withdraw permission at any time.
    </p>
    {loading?<p role="status" className="mt-2 text-sm">Loading your biography…</p>:
    <form noValidate onSubmit={save} className="mt-4 space-y-3">
      <Field label="Display name" className="text-xs" required error={attempted&&displayName.trim().length<2?"Enter a display name with at least 2 characters.":undefined}>
        <Input value={displayName} onChange={e=>setDisplayName(e.target.value)} minLength={2} maxLength={100} disabled={saving}/>
      </Field>
      <Field label="Public school role/title" className="text-xs" required error={attempted&&publicTitle.trim().length<2?"Enter a public role or title with at least 2 characters.":undefined}>
        <Input value={publicTitle} onChange={e=>setPublicTitle(e.target.value)} minLength={2} maxLength={100} disabled={saving}/>
      </Field>
      <Field label="Parent-facing biography" className="text-xs" required error={attempted&&biography.trim().length<30?"Enter a biography with at least 30 characters.":undefined}>
        <Textarea value={biography} onChange={e=>setBiography(e.target.value)} minLength={30} maxLength={1200} rows={4} disabled={saving}/>
      </Field>
      <Field label="Permission expires on" className="text-xs" required error={attempted&&!expiresOn?"Choose an expiry date for this permission.":undefined}>
        <Input type="date" value={expiresOn} onChange={e=>setExpiresOn(e.target.value)} disabled={saving}/>
      </Field>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={saving}>
          {saving?"Saving…":"Consent to publish"}
        </Button>
        {existing&&<Button type="button" variant="outline" onClick={()=>void revoke()} disabled={saving}>Withdraw permission</Button>}
      </div>
      {status&&<p role="status" className="text-sm">{status}</p>}
    </form>}
  </section>;
}

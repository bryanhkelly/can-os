import {useEffect,useState} from "react";
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
    event.preventDefault();setStatus("");setSaving(true);
    try{
      await changeMyPublicSiteBio({data:{
        action:"consent",siteId,displayName,publicTitle,biography,expiresOn,
      }});
      setExisting(true);
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
    <form onSubmit={save} className="mt-4 space-y-3">
      <label className="block text-xs">Display name
        <input className="mt-1 w-full rounded border bg-background p-2 text-sm"
          value={displayName} onChange={e=>setDisplayName(e.target.value)}
          minLength={2} maxLength={100} required disabled={saving}/>
      </label>
      <label className="block text-xs">Public school role/title
        <input className="mt-1 w-full rounded border bg-background p-2 text-sm"
          value={publicTitle} onChange={e=>setPublicTitle(e.target.value)}
          minLength={2} maxLength={100} required disabled={saving}/>
      </label>
      <label className="block text-xs">Parent-facing biography
        <textarea className="mt-1 w-full rounded border bg-background p-2 text-sm"
          value={biography} onChange={e=>setBiography(e.target.value)}
          minLength={30} maxLength={1200} rows={4} required disabled={saving}/>
      </label>
      <label className="block text-xs">Permission expires on
        <input type="date" className="mt-1 w-full rounded border bg-background p-2 text-sm"
          value={expiresOn} onChange={e=>setExpiresOn(e.target.value)}
          required disabled={saving}/>
      </label>
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={saving}
          className="rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground">
          {saving?"Saving…":"Consent to publish"}
        </button>
        {existing&&<button type="button" onClick={()=>void revoke()} disabled={saving}
          className="rounded-lg border px-4 py-2 text-sm">Withdraw permission</button>}
      </div>
      {status&&<p role="status" className="text-sm">{status}</p>}
    </form>}
  </section>;
}

import { useEffect, useState } from "react";
import { getSiteFamilyServicesSetup, saveSiteFamilyServicesSetup } from
  "@/modules/sites/site-family-services.functions";
import type { SiteFamilyServices } from "@/domain/site-family-services";

type Entry = SiteFamilyServices["entries"][number];
const categories: Array<{key:Entry["category"];label:string}> = [
  {key:"meals",label:"Meals"},
  {key:"transportation",label:"Transportation"},
  {key:"before_care",label:"Before-school care"},
  {key:"after_care",label:"After-school care"},
  {key:"communication",label:"Family communication and support"},
  {key:"family_visits",label:"Family visits"},
  {key:"safety_summary",label:"Safety and supervision overview"},
];
const blank = (category:Entry["category"]):Entry => ({
  category,status:"not_offered",description:"",evidenceReference:null,expiresOn:null,
});

/** A bounded institutional form, not a general website/content editor. */
export function FamilyServicesSetupPanel({siteId}:{siteId:string}) {
  const [revision,setRevision]=useState(0);
  const [entries,setEntries]=useState<Entry[]>([]);
  const [busy,setBusy]=useState(false);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState("");
  const [message,setMessage]=useState("");
  const [reviewed,setReviewed]=useState(false);
  const [reason,setReason]=useState("");
  useEffect(()=>{
    let live=true;
    setLoading(true);
    getSiteFamilyServicesSetup({data:{siteId}}).then(result=>{
      if(!live)return;
      setEntries(result.entries);
      setRevision(result.revision);
      setLoading(false);
    }).catch(()=>{
      if(!live)return;
      setError("Unable to load Site service configuration.");
      setLoading(false);
    });
    return ()=>{live=false};
  },[siteId]);
  function update(category:Entry["category"],change:Partial<Entry>) {
    setReviewed(false);setMessage("");
    setEntries(previous=>{
      const current=previous.find(item=>item.category===category)??blank(category);
      return [...previous.filter(item=>item.category!==category),{...current,...change}];
    });
  }
  async function save(event:React.FormEvent) {
    event.preventDefault();setError("");setMessage("");
    if(!reviewed)return setError("Review the statements before recording approval.");
    setBusy(true);
    try {
      const saved=await saveSiteFamilyServicesSetup({data:{
        siteId,expectedRevision:revision,entries,reason,contentReviewed:true,
      }});
      setRevision(saved.revision);setReviewed(false);setReason("");
      setMessage("Family-service review saved. The public site must still pass its separate publishing gate.");
    }catch{
      setError("The review could not be saved. Check evidence and refresh before retrying.");
    }finally{setBusy(false)}
  }
  if(loading)return <p role="status" className="text-sm">Loading family services…</p>;
  return <section aria-label="Family services configuration" className="space-y-4 rounded-xl border bg-card p-5">
    <h2 className="font-serif text-xl">Family services and school-life support</h2>
    <p className="text-sm text-muted-foreground">
      These statements come from Site configuration. Only the institutional Site publisher
      may review them. Proposed programs are never described as operating services.
    </p>
    <form onSubmit={save} className="space-y-4">
      {categories.map(({key,label})=>{
        const item=entries.find(value=>value.category===key)??blank(key);
        return <fieldset key={key} className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2">
          <legend className="px-1 text-sm font-semibold">{label}</legend>
          <label className="text-xs">Current status
            <select className="mt-1 block w-full rounded border bg-background p-2 text-sm"
              value={item.status} disabled={busy}
              onChange={event=>update(key,{status:event.target.value as Entry["status"]})}>
              <option value="not_offered">Not offered</option>
              <option value="planned">Planned, not yet available</option>
              <option value="confirmed">Confirmed, availability not opened</option>
              <option value="available">Available</option>
            </select>
          </label>
          <label className="text-xs">Review date for this statement (optional expiry)
            <input className="mt-1 block w-full rounded border bg-background p-2 text-sm" type="date"
              disabled={busy} value={item.expiresOn??""}
              onChange={event=>update(key,{expiresOn:event.target.value||null})}/>
          </label>
          <label className="text-xs sm:col-span-2">Parent-friendly description
            <textarea className="mt-1 block w-full rounded border bg-background p-2 text-sm"
              value={item.description} disabled={busy} maxLength={1200} rows={2}
              onChange={event=>update(key,{description:event.target.value})}/>
          </label>
          <label className="text-xs sm:col-span-2">Internal supporting evidence (not shown publicly)
            <input className="mt-1 block w-full rounded border bg-background p-2 text-sm"
              value={item.evidenceReference??""} disabled={busy} maxLength={500}
              placeholder="Reference to reviewed vendor, staff or operating decision"
              onChange={event=>update(key,{evidenceReference:event.target.value||null})}/>
          </label>
        </fieldset>;
      })}
      <label className="block text-xs">Publication review reason
        <textarea className="mt-1 block w-full rounded border bg-background p-2 text-sm"
          value={reason} disabled={busy} minLength={10} maxLength={500} rows={2}
          onChange={event=>setReason(event.target.value)} required/>
      </label>
      <label className="flex gap-2 text-sm">
        <input type="checkbox" checked={reviewed} disabled={busy}
          onChange={event=>setReviewed(event.target.checked)}/>
        I reviewed each current service statement and its supporting evidence.
      </label>
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      {message&&<p role="status" className="text-sm">{message}</p>}
      <button className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        type="submit" disabled={busy||!reviewed||reason.trim().length<10}>
        {busy?"Saving review…":"Save verified service information"}
      </button>
    </form>
  </section>;
}

import {useState} from "react";
import {Button} from "@/components/ui/button";
import {Field} from "@/components/ui/field";
import {Input} from "@/components/ui/input";
import {Select} from "@/components/ui/select";

/** Safe draft-only identity editor. Public address/slug is deliberately immutable here. */
export function LaunchSiteIdentityEditor({
  initial,revision,busy,save,
}:{
  initial:{name:string;timezone:string;slug:string};
  revision:string;
  busy:boolean;
  save:(identity:{name:string;timezone:string},revision:string,reason:string)=>Promise<void>;
}){
  const [name,setName]=useState(initial.name);
  const [timezone,setTimezone]=useState(initial.timezone);
  const [reason,setReason]=useState("");
  const [editing,setEditing]=useState(false);
  const [error,setError]=useState("");
  const zones=[...new Set([timezone,"America/Los_Angeles","America/Denver",
    "America/Chicago","America/New_York","America/Phoenix","America/Anchorage",
    "Pacific/Honolulu","UTC",...Intl.supportedValuesOf("timeZone")])].filter(Boolean);
  return <section className="rounded-lg border p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm font-semibold">School Site identity</p>
      <Button type="button" size="sm" variant="outline" onClick={()=>setEditing(value=>!value)}>
        {editing?"Close editor":"Edit name or time zone"}
      </Button>
    </div>
    {!editing&&<p className="mt-2 text-xs text-muted-foreground">
      {initial.name} · {initial.timezone} · Site key: {initial.slug}
    </p>}
    {editing&&<div className="mt-3 space-y-3">
      <p className="text-xs text-muted-foreground">
        Draft Site changes do not approve public school claims. A reserved website
        address is not renamed here. Time zone changes are blocked when any Program,
        school year or calendar activity already depends on the Site.
      </p>
      <Field label="School location name" required>
        <Input value={name} onChange={e=>setName(e.target.value)}/>
      </Field>
      <Field label="School time zone" required>
        <Select value={timezone} onChange={e=>setTimezone(e.target.value)}>
          <option value="">Choose a time zone…</option>
          {zones.map(zone=><option key={zone} value={zone}>{zone.replaceAll("_"," ")}</option>)}
        </Select>
      </Field>
      <Field label="Reason for changing Site identity" required>
        <Input value={reason} onChange={e=>setReason(e.target.value)}
          placeholder="E.g., corrected campus display name"/>
      </Field>
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="button" size="sm" disabled={busy||name.trim().length<2||!timezone||reason.trim().length<5}
        onClick={async()=>{
          setError("");
          try{await save({name,timezone},revision,reason);setEditing(false);}
          catch(e){setError(e instanceof Error?e.message:"Could not update school identity");}
        }}>Save draft identity</Button>
    </div>}
  </section>;
}

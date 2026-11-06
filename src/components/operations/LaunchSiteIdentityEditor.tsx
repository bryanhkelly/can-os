import {useState} from "react";
import {Button} from "@/components/ui/button";
import {Field} from "@/components/ui/field";
import {Input} from "@/components/ui/input";
import {SiteTimezoneField} from "@/components/workspace/SiteTimezoneField";
import {LaunchFieldHelp} from "@/components/launch-studio/LaunchFieldHelp";
import {useLaunchDraftChanges,useLaunchUnsavedChanges} from "@/components/launch-studio/useLaunchUnsavedChanges";

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
  const changes=useLaunchDraftChanges({name,timezone,reason});
  useLaunchUnsavedChanges(changes.dirty || (editing && busy));
  return <section className="rounded-lg border p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">School location name</p>
      <Button type="button" size="sm" variant="outline" onClick={()=>setEditing(value=>!value)}>
        {editing?"Close editor":"Edit name or time zone"}
      </Button>
    </div>
    {!editing&&<div className="mt-2">
      <p className="text-base font-semibold">{initial.name}</p>
      <LaunchFieldHelp label="About the saved location name and time zone">
        Time zone: {initial.timezone.replaceAll("_"," ")}. Editing the name does not rename your website.
        Once school calendars depend on this time zone, changes need coordinated review.
      </LaunchFieldHelp>
    </div>}
    {editing&&<div className="mt-3 space-y-3">
      <p className="text-xs text-muted-foreground">
        Update your location's name or time zone. This won't rename your website.
        If calendars already use this time zone, ask CAN to help change it.
      </p>
      <Field label="School location name" required>
        <Input value={name} onChange={e=>setName(e.target.value)}/>
      </Field>
      <SiteTimezoneField label="School time zone" value={timezone} onChange={setTimezone} />
      <Field label="Why are you making this change?" required>
        <Input value={reason} onChange={e=>setReason(e.target.value)}
          placeholder="E.g., corrected campus display name"/>
      </Field>
      {error&&<p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="button" size="sm" disabled={busy||name.trim().length<2||!timezone||reason.trim().length<5}
        onClick={async()=>{
          setError("");
          try{await save({name,timezone},revision,reason);changes.markSaved({name,timezone,reason});setEditing(false);}
          catch(e){setError(e instanceof Error?e.message:"Could not update school identity");}
        }}>Save location details</Button>
    </div>}
  </section>;
}

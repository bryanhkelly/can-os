import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export type LaunchSiteContactDraft = {displayName:string;email:string;phone:string};

export function LaunchSiteContactEditor({
 initial, revision, busy, save
}:{
 initial:unknown;revision:string;busy:boolean;
 save:(contact:LaunchSiteContactDraft|null,revision:string)=>Promise<void>;
}){
 const source=initial && typeof initial==="object" && !Array.isArray(initial)
   ? initial as Record<string,unknown> : {};
 const [contact,setContact]=useState<LaunchSiteContactDraft>({
   displayName:String(source.displayName??""),
   email:String(source.email??""),
   phone:String(source.phone??""),
 });
 const [editing,setEditing]=useState(false);
 const [error,setError]=useState("");
 return <div className="rounded-lg border p-3">
   <div className="flex flex-wrap items-center justify-between gap-2">
     <p className="text-sm font-semibold">School contact · private draft</p>
     <Button type="button" size="sm" variant="outline"
       onClick={()=>setEditing(v=>!v)}>{editing?"Close editor":"Edit contact"}</Button>
   </div>
   {!editing && <p className="mt-2 text-xs text-muted-foreground">
     {contact.displayName || "No school contact saved yet"}
     {contact.email ? " · "+contact.email : ""}
   </p>}
   {editing && <div className="mt-3 space-y-3">
     <p className="text-xs text-muted-foreground">Private contact draft only. It is not displayed to families without separate institutional review. Church website, social and video links belong in the church-reference editor.</p>
     <div className="grid gap-2 sm:grid-cols-2">
       {([
         ["displayName","School contact name"],["email","Email (optional)"],
         ["phone","Phone (optional)"],
       ] as const).map(([key,label])=><Field key={key} label={label}>
         <Input value={contact[key]} type={key==="email"?"email":"text"}
           onChange={e=>setContact({...contact,[key]:e.target.value})}/>
       </Field>)}
     </div>
     {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
     <Button type="button" disabled={busy || contact.displayName.trim().length<2}
       onClick={async()=>{
         setError("");
         try{await save(contact,revision);setEditing(false);}
         catch(e){setError(e instanceof Error?e.message:"Could not save contact");}
       }}>Save private contact</Button>
     {!!initial && <Button type="button" variant="outline" disabled={busy}
       onClick={async()=>{
         setError("");
         try{await save(null,revision);setEditing(false);}
         catch(e){setError(e instanceof Error?e.message:"Unable to clear the private contact");}
       }}>Clear private contact</Button>}
   </div>}
 </div>;
}

export function AdmissionsGuardianActions({applicationId,verified,loginProvisioned,busy,onVerify,onProvision,onInvite}:{
 applicationId:string;verified:boolean;loginProvisioned:boolean;busy:boolean;
 onVerify:(applicationId:string)=>void;
 onProvision:(applicationId:string)=>void;
 onInvite:(applicationId:string)=>void;
}){
 return <>
  <p className="mt-3 text-xs text-muted-foreground">
   Guardian verification: <strong>{verified?"Verified":"Required"}</strong> ·{" "}
   Sign-in access: <strong>{loginProvisioned?"Provisioned":"Not provisioned"}</strong>.
   Verify the relationship independently before granting or inviting access.
  </p>
  <div className="mt-3 flex flex-wrap gap-2">
   <button type="button" disabled={busy||verified} onClick={()=>onVerify(applicationId)}
    className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">
    {verified?"Relationship verified":"Verify guardian relationship"}
   </button>
   <button type="button" disabled={busy||!verified||loginProvisioned} onClick={()=>onProvision(applicationId)}
    className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">
    {loginProvisioned?"Login provisioned":"Provision guardian login"}
   </button>
   <button type="button" disabled={busy||!loginProvisioned} onClick={()=>onInvite(applicationId)}
    className="rounded-lg border px-3 py-2 text-xs font-semibold disabled:opacity-50">
    Send secure guardian invitation
   </button>
  </div>
 </>;
}

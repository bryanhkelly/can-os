type Grant={id:string;personId:string;role:string;siteId:string|null;organizationId:string|null};

/** Choose only an existing membership of the same signed-in person. The
 * canonical session endpoint independently verifies account ownership and activity. */
export function launchWebsiteHandoffGrant(grants:readonly Grant[],input:{
 activeGrantId:string;siteId:string;destination:"editor"|"launch";returnGrantId?:string;
}):Grant|null{
 const current=grants.find(grant=>grant.id===input.activeGrantId);
 if(!current)return null;
 const candidates=grants.filter(grant=>grant.personId===current.personId&&(
  input.destination==="editor"
   ?grant.role==="site_website_editor"&&grant.siteId===input.siteId&&grant.organizationId===current.organizationId
   :grant.id===input.returnGrantId&&grant.role==="registrar"&&(
     grant.siteId===input.siteId||(grant.siteId===null&&grant.organizationId===current.organizationId)
    )
 ));
 return candidates.length===1?candidates[0]!:null;
}

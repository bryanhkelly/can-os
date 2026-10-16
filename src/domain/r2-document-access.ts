/** Fail closed for all Cloudflare R2 operations; only explicitly enabled synthetic sessions may proceed. */
export function assertR2DemoEnabled(value:string|undefined):void {
 if(value!=="true")throw new Error("R2 demo uploads are disabled");
}
export type R2Member={role:string;actorPersonId:string|null;organizationIds?:readonly string[]};
export function assertR2DocumentGrant(member:R2Member,resource:{organizationId:string;guardianCanManage:boolean}):void {
 if(!member.actorPersonId)throw new Error("Authenticated person required");
 if(member.role==="registrar"&&member.organizationIds?.includes(resource.organizationId))return;
 if(member.role==="guardian"&&resource.guardianCanManage)return;
 throw new Error("Enrollment document access denied");
}

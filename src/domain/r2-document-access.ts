import { AuthenticationRequiredError } from "./errors";

/** Demo-tenant uploads require an explicit deployment opt-in. */
export function assertDemoTenantStorageEnabled(value:string|undefined):void {
 if(value!=="true")throw new Error("Demo tenant document uploads are disabled");
}
export type R2Member={role:string;actorPersonId:string|null;organizationIds?:readonly string[]};
export function assertR2DocumentGrant(member:R2Member,resource:{organizationId:string;guardianCanManage:boolean}):void {
 if(!member.actorPersonId)throw new AuthenticationRequiredError();
 if(member.role==="registrar"&&member.organizationIds?.includes(resource.organizationId))return;
 if(member.role==="guardian"&&resource.guardianCanManage)return;
 throw new Error("Enrollment document access denied");
}

import { isDemoTenantOrganization } from "./local-demo-access";

/** Enrollment demo uploads require an explicit deployment opt-in. */
export function assertR2DemoEnabled(value:string|undefined):void {
 if(value!=="true")throw new Error("R2 demo uploads are disabled");
}
/** Legacy fixture objects are accepted only within the canonical demo tenant. */
export function enrollmentDocumentStorageVerified(metadata:Record<string,unknown>,organizationId:string):boolean {
 return metadata.storageVerified===true ||
  (isDemoTenantOrganization(organizationId)&&metadata.synthetic===true);
}
export type R2Member={role:string;actorPersonId:string|null;organizationIds?:readonly string[]};
export function assertR2DocumentGrant(member:R2Member,resource:{organizationId:string;guardianCanManage:boolean}):void {
 if(!member.actorPersonId)throw new Error("Authenticated person required");
 if(member.role==="registrar"&&member.organizationIds?.includes(resource.organizationId))return;
 if(member.role==="guardian"&&resource.guardianCanManage)return;
 throw new Error("Enrollment document access denied");
}

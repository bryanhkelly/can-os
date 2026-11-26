import { hasRegistrarAuthority } from "@/domain/school-roles";

/** All enrollment documents require the same verified storage evidence. */
export function enrollmentDocumentStorageVerified(metadata:Record<string,unknown>,_organizationId:string):boolean {
 return metadata.storageVerified===true;
}
export type R2Member={role:string;actorPersonId:string|null;organizationIds?:readonly string[]};
export function assertR2DocumentGrant(member:R2Member,resource:{organizationId:string;guardianCanManage:boolean}):void {
 if(!member.actorPersonId)throw new Error("Authenticated person required");
 if(hasRegistrarAuthority(member.role)&&member.organizationIds?.includes(resource.organizationId))return;
 if(member.role==="guardian"&&resource.guardianCanManage)return;
 throw new Error("Enrollment document access denied");
}

import {createHash} from "node:crypto";
export const manualTaskType="operational_task";
export function taskFingerprint(value:unknown):string{
 return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}
/** Stable UUID per actor and client-generated request ID; no new receipt table. */
export function manualTaskId(accountId:string,requestId:string):string{
 const h=taskFingerprint(["operational_task.v1",accountId,requestId]);
 return [h.slice(0,8),h.slice(8,12),"5"+h.slice(13,16),"8"+h.slice(17,20),h.slice(20,32)].join("-");
}
export function escalationDisposition(input:{status:string;priority:string;updatedAt:string;expectedUpdatedAt:string;priorFingerprint:unknown;fingerprint:string}):"replay"|"conflict"|"change"{
 if(!["open","in_progress","waiting"].includes(input.status))return "conflict";
 if(input.priorFingerprint===input.fingerprint&&input.priority==="urgent")return "replay";
 if(input.updatedAt!==input.expectedUpdatedAt||input.priority==="urgent")return "conflict";
 return "change";
}

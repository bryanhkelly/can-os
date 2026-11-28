import {
  getVerifiedPlatformOwnerSession, listPlatformOwnerTargets, readPlatformOwnerDelegationStatus,
  startPlatformOwnerDelegation, stopPlatformOwnerDelegation, rotatePrivateAccountAccessCode,
} from "./platform-owner-delegation.server";
import { AuthorizationError } from "@/domain/command-context";

/** Management is always authorized as the independently verified original
 * owner. It never inherits the effective delegated role or its capabilities.
 * Each underlying service rechecks current owner/target state. */
export async function resolveHttpOwnerControl(request:Request) {
  await getVerifiedPlatformOwnerSession(request);
  const read=()=>{if(request.method!=="GET")throw new AuthorizationError("owner management read");};
  const write=()=>{if(request.method!=="POST"||request.headers.get("origin")!==new URL(request.url).origin)
    throw new AuthorizationError("same-origin owner management write");};
  return {
    status:()=>{read();return readPlatformOwnerDelegationStatus(request);},
    targets:(search:string)=>{read();return listPlatformOwnerTargets(request,search);},
    start:(input:unknown)=>{write();return startPlatformOwnerDelegation(request,input);},
    stop:()=>{write();return stopPlatformOwnerDelegation(request);},
    recover:(input:unknown)=>{write();return rotatePrivateAccountAccessCode(request,input);},
  };
}

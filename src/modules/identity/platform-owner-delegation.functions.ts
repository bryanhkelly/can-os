import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  getVerifiedPlatformOwnerSession, listPlatformOwnerTargets,
  startPlatformOwnerDelegation, stopPlatformOwnerDelegation, rotatePrivateAccountAccessCode,
} from "./platform-owner-delegation.server";

const noStore=()=>setResponseHeader("Cache-Control","private, no-store");

/** Server-authenticated owner search. This endpoint exposes no password,
 * private record body or role-assignment mutation.
 */
export const searchPlatformOwnerTargets=createServerFn({method:"GET"})
  .validator((raw:unknown)=>z.object({search:z.string().trim().min(2).max(100)}).strict().parse(raw))
  .handler(async({data})=>{noStore();return listPlatformOwnerTargets(getRequest(),data.search);});

export const readPlatformOwnerDelegation=createServerFn({method:"GET"})
  .handler(async()=>{noStore();const owner=await getVerifiedPlatformOwnerSession(getRequest());
    return {active:!!owner.delegatedGrantId&&!!owner.delegatedUntil&&owner.delegatedUntil>new Date(),
      mode:owner.delegatedMode,expiresAt:owner.delegatedUntil?.toISOString()??null};
  });

export const beginPlatformOwnerDelegation=createServerFn({method:"POST"})
  .validator((raw:unknown)=>z.object({
    grantId:z.string().uuid(),mode:z.enum(["view","act"]),
    reason:z.string().trim().min(12).max(500),
  }).strict().parse(raw))
  .handler(async({data})=>{noStore();return startPlatformOwnerDelegation(getRequest(),data);});

export const endPlatformOwnerDelegation=createServerFn({method:"POST"})
  .validator((raw:unknown)=>z.object({confirm:z.literal(true)}).strict().parse(raw))
  .handler(async()=>{noStore();return stopPlatformOwnerDelegation(getRequest());});

/** Never cache the one-time raw replacement credential. */
export const recoverPrivateAccountAccessCode=createServerFn({method:"POST"})
  .validator((raw:unknown)=>z.object({grantId:z.string().uuid(),reason:z.string().trim().min(12).max(500),confirm:z.literal(true)}).strict().parse(raw))
  .handler(async({data})=>{noStore();setResponseHeader("Referrer-Policy","no-referrer");return rotatePrivateAccountAccessCode(getRequest(),data);});

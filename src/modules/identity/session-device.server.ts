import {and,desc,eq,gt,isNull,ne} from "drizzle-orm";
import {db} from "@/db/client";
import {accessSessions,accessSessionSignals} from "@/db/schema";
import type {AccessContext} from "@/domain/access-context";
import {AuthorizationError} from "@/domain/command-context";
import {sessionIdleCutoff} from "@/domain/access-tokens";
import {readTrustedSessionDevice} from "./trusted-session-device.server";
/** Descriptive tab metadata, never an authorization factor. */
export async function registerSessionDevice(actor:AccessContext,request:Request,input:{clientInstanceId:string;sharedDevice:boolean}){
 const accountId=actor.sessionAccountId??actor.accountId;
 const now=new Date(),device=await readTrustedSessionDevice(request);
 return db.transaction(async tx=>{
  const [session]=await tx.select().from(accessSessions).where(and(
   eq(accessSessions.id,actor.sessionId),eq(accessSessions.accountId,accountId),
   isNull(accessSessions.revokedAt),gt(accessSessions.expiresAt,now),
   gt(accessSessions.updatedAt,sessionIdleCutoff(now)))).limit(1);
  if(!session)throw new AuthorizationError("current session");
  if(session.sharedDevice&&now.getTime()-session.lastActivityAt.getTime()>=5*60_000)
   throw new AuthorizationError("shared device session expired");
  if(session.clientInstanceId===null){
   const prior=await tx.select({deviceCategory:accessSessions.deviceCategory,
    browserFamily:accessSessions.browserFamily,osFamily:accessSessions.osFamily})
     .from(accessSessions).where(and(eq(accessSessions.accountId,accountId),
      ne(accessSessions.id,session.id))).orderBy(desc(accessSessions.createdAt)).limit(30);
   const hasPrior=prior.some(p=>p.deviceCategory!==null);
   const seen=prior.some(p=>p.deviceCategory===device.deviceCategory&&
    p.browserFamily===device.browserFamily&&p.osFamily===device.osFamily);
   const concurrent=await tx.select({id:accessSessions.id}).from(accessSessions).where(and(
    eq(accessSessions.accountId,accountId),ne(accessSessions.id,session.id),
    isNull(accessSessions.revokedAt),gt(accessSessions.expiresAt,now),
    gt(accessSessions.updatedAt,sessionIdleCutoff(now)))).limit(1);
   if(hasPrior&&!seen)await tx.insert(accessSessionSignals).values({
    accountId,sessionId:session.id,signal:"new_device_profile",details:{category:device.deviceCategory},
   }).onConflictDoNothing();
   if(concurrent.length)await tx.insert(accessSessionSignals).values({
    accountId,sessionId:session.id,signal:"concurrent_session",
   }).onConflictDoNothing();
  }
  if(session.ipAddress&&device.ipAddress&&session.ipAddress!==device.ipAddress)
   await tx.insert(accessSessionSignals).values({
    accountId,sessionId:session.id,signal:"network_changed",
   }).onConflictDoNothing();
  await tx.update(accessSessions).set({
   clientInstanceId:input.clientInstanceId,
   deviceCategory:device.deviceCategory,browserFamily:device.browserFamily,
   osFamily:device.osFamily,sharedDevice:input.sharedDevice,
   ...(device.ipAddress?{ipAddress:device.ipAddress,networkObservedAt:now}:{})
  }).where(eq(accessSessions.id,session.id));
  return {registered:true};
 });
}

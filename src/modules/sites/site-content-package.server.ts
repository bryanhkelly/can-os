import {EventTypes} from "@/domain/event-types";
import {emitReportableChange} from "@/platform/reportable-event";
import {createHash,randomUUID} from "node:crypto";
import {and,desc,eq,gt,sql} from "drizzle-orm";
import {db} from "@/db/client";
import {sites,siteIntelligenceVersions as inputs,siteGeneratedContentVersions as outputs} from "@/db/schema";
import {canonicalJson} from "@/lib/canonical-json";
import {AuthorizationError} from "@/domain/command-context";
import {siteGenerationOptionsSchema,type SiteGenerationOptions} from "@/domain/site-content-generation";
import {buildSitePackageInput,parseSiteContentPackage,privatePackageSourcesMatch,sitePackageInputSchema} from "@/domain/site-content-package";
import {writeAudit} from "@/platform/mutation";
import type {AccessContext} from "@/domain/access-context";
import {readAuthorizedSiteContentBrief} from "./site-content-brief.server";
import {generationEligibility,legacyGlooRetryEligible} from "@/domain/site-generation-status";
import {generateSitePackageWithGloo,assertGlooConfiguration,safeGlooFailure,glooConfiguration} from "./gloo-content-provider.server";
type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];
type Consumer="website"|"outreach";
type Request={siteId:string;consumer:Consumer;options:SiteGenerationOptions};
const hash=(value:unknown)=>createHash("sha256").update(canonicalJson(value)).digest("hex");
const scope=(siteId:string,organizationId:string)=>and(eq(inputs.siteId,siteId),eq(inputs.organizationId,organizationId));
const leaseMs=120_000;
function assertActor(actor:AccessContext){
 if(!actor.actorPersonId||actor.delegationMode==="view")throw new AuthorizationError("Site content authoring authority");
}
async function prepare(actor:AccessContext,data:Request,tx?:Tx){
 assertActor(actor);
 if(data.consumer!=="website")throw new AuthorizationError("Process Site Intelligence through Website & Brand");
 const brief=await readAuthorizedSiteContentBrief(actor,data.siteId,data.consumer,tx);
 const input=buildSitePackageInput(brief,data.options);
 if(new TextEncoder().encode(canonicalJson(input)).byteLength>48000)throw new Error("Site Intelligence input is too large.");
 return {brief,input,digest:hash(input)};
}
async function readEligibility(tx:Tx,siteId:string,organizationId:string,digest:string){
 const scoped=scope(siteId,organizationId);
 const now=new Date();
 const [attempt]=await tx.select().from(inputs).where(and(scoped,eq(inputs.inputDigest,digest))).limit(1);
 const [active]=await tx.select({leaseUntil:inputs.leaseUntil}).from(inputs).where(and(scoped,eq(inputs.status,"processing"),gt(inputs.leaseUntil,now))).limit(1);
 const [usage]=await tx.select({count:sql<number>`count(*)::int`}).from(inputs).where(and(scoped,gt(inputs.createdAt,new Date(now.getTime()-86400000))));
 const config=glooConfiguration();
 return {attempt,eligibility:generationEligibility({attempt:attempt??null,activeUntil:active?.leaseUntil??null,dailyCount:usage?.count??0,configured:config.keyConfigured&&config.modelConfigured,configurationError:!config.keyConfigured&&!config.modelConfigured?"gloo_missing_both":!config.keyConfigured?"gloo_missing_key":!config.modelConfigured?"gloo_missing_model":undefined,now})};
}
export async function previewSitePackage(actor:AccessContext,data:Request){
 return db.transaction(async tx=>{
  const {brief,input,digest}=await prepare(actor,data,tx);
  const {eligibility}=await readEligibility(tx,data.siteId,brief.organizationId,digest);
  return {input,digest,sourceRevisions:brief.sourceRevisions,eligibility};
 });
}
function safeStoredInput(row:typeof inputs.$inferSelect){
 return sitePackageInputSchema.parse(row.input);
}
async function lockSite(tx:Tx,siteId:string,organizationId:string){
 const [site]=await tx.select({id:sites.id}).from(sites).where(and(eq(sites.id,siteId),eq(sites.organizationId,organizationId))).for("update");
 if(!site)throw new AuthorizationError("Site ownership changed");
}
export async function readStoredSitePackage(actor:AccessContext,siteId:string,consumer:Consumer,executor?:Tx){
 const read=async(tx:Tx)=>{
   const brief=await readAuthorizedSiteContentBrief(actor,siteId,consumer==="outreach"?"read":consumer,tx);
   if(!brief.consent.contentReuseAllowed)return {status:"consent-required" as const,package:null,generation:null};
   const scoped=scope(siteId,brief.organizationId);
   const [latest]=await tx.select({status:inputs.status,leaseUntil:inputs.leaseUntil,attempts:inputs.attempts,errorCode:inputs.errorCode,revision:inputs.revision}).from(inputs).where(scoped).orderBy(desc(inputs.updatedAt),desc(inputs.revision)).limit(1);
   const generation=latest?{status:latest.status,attempts:latest.attempts,errorCode:latest.errorCode,leaseUntil:latest.leaseUntil?.toISOString()??null}:null;
   const rows=await tx.select({source:inputs,result:outputs}).from(inputs).innerJoin(outputs,and(eq(outputs.intelligenceVersionId,inputs.id),eq(outputs.siteId,inputs.siteId),eq(outputs.organizationId,inputs.organizationId))).where(and(scoped,eq(inputs.status,"ready"))).orderBy(desc(inputs.updatedAt),desc(inputs.revision)).limit(20);
   for(const {source,result} of rows){
     const saved=safeStoredInput(source);
     const current=buildSitePackageInput(brief,siteGenerationOptionsSchema.parse(source.options));
     if(!privatePackageSourcesMatch(saved,current))continue;
     // A change in identity can invalidate faith-specific copy.
     if(canonicalJson(saved.site.identity)!==canonicalJson(current.site.identity))continue;
     if(hash(saved)!==source.inputDigest||hash(result.content)!==result.outputDigest)throw new Error("Stored Site Intelligence integrity check failed.");
     const content=parseSiteContentPackage(canonicalJson(result.content),saved);
     return {status:"ready" as const,generation,latestStatus:latest?.status??"ready",package:{id:result.id,revision:source.revision,generatedAt:result.createdAt.toISOString(),language:saved.preferences.language,stale:hash(current)!==source.inputDigest,website:consumer==="website"?content.website:null,websiteComposition:consumer==="website"?content.websiteComposition??null:null,marketing:consumer==="outreach"?content.marketing:null,reviewNotes:content.reviewNotes}};
   }
   return {generation,status:latest?.status==="processing"&&latest.leaseUntil&&latest.leaseUntil>new Date()?"processing" as const:latest?"refresh-required" as const:"not-generated" as const,package:null};
 };
 return executor?read(executor):db.transaction(read);
}
export async function processSitePackage(actor:AccessContext,data:Request&{digest:string},resolveActor:()=>Promise<AccessContext>){
 const before=await prepare(actor,data);
 if(before.digest!==data.digest)throw new Error("Saved Site information changed. Review the input again.");
 const organizationId=before.brief.organizationId;
 const token=randomUUID();
 const claim=await db.transaction(async tx=>{
   await lockSite(tx,data.siteId,organizationId);
   const checked=await prepare(actor,data,tx);
   if(checked.digest!==data.digest||checked.brief.organizationId!==organizationId)throw new Error("Site input changed.");
   const scoped=scope(data.siteId,organizationId);
   const {attempt:existing,eligibility}=await readEligibility(tx,data.siteId,organizationId,data.digest);
   const now=new Date();
   if(existing?.status==="ready"){
     // Re-select the prior successful package without another provider call.
     const reusedAt=new Date(Math.max(now.getTime(),existing.updatedAt.getTime()+1));
     await tx.update(inputs).set({updatedAt:reusedAt}).where(eq(inputs.id,existing.id));
     await emitReportableChange(tx,{eventType:EventTypes.SiteIntelligencePackageReused,sourceId:existing.id,sourceVersion:reusedAt.toISOString(),occurredAt:reusedAt,actorPersonId:actor.actorPersonId,dimensions:{organizationId,siteId:data.siteId},payload:{attempt:existing.attempts}});
     await writeAudit(tx,actor,{action:"site.content_generation.reused",entityType:"site",entityId:data.siteId,scope:{siteId:data.siteId,organizationId},after:{inputId:existing.id,inputDigest:data.digest}});
     return {kind:"reused" as const};
   }
   // The same eligibility contract is evaluated under the Site lock before a billable claim.
   if(!eligibility.allowed){
     if(eligibility.code==="processing")return {kind:"processing" as const};
     return {kind:"failed" as const,code:eligibility.code,message:eligibility.message};
   }
   try{assertGlooConfiguration();}catch(error){return {kind:"failed" as const,...safeGlooFailure(error)};}
   const nextAttempt=Math.min(3,(existing?.attempts??0)+1);
   const leaseUntil=new Date(now.getTime()+leaseMs);
   let inputId:string;
   if(existing){
     await tx.update(inputs).set({status:"processing",attempts:nextAttempt,leaseToken:token,leaseUntil,errorCode:null,updatedAt:now}).where(eq(inputs.id,existing.id));
     inputId=existing.id;
   }else{
     const [last]=await tx.select({revision:inputs.revision}).from(inputs).where(scoped).orderBy(desc(inputs.revision)).limit(1);
     const [row]=await tx.insert(inputs).values({siteId:data.siteId,organizationId,revision:(last?.revision??0)+1,inputDigest:data.digest,input:checked.input,options:data.options,sourceRevisions:checked.brief.sourceRevisions,requestedByPersonId:actor.actorPersonId!,status:"processing",attempts:1,leaseToken:token,leaseUntil}).returning({id:inputs.id});
     if(!row)throw new Error("Could not claim Site Intelligence input");
     inputId=row.id;
   }
   await writeAudit(tx,actor,{action:"site.content_generation.requested",entityType:"site",entityId:data.siteId,scope:{siteId:data.siteId,organizationId},after:{inputId,inputDigest:data.digest,provider:"gloo",externalProcessingConfirmed:true}});
   const attempt=nextAttempt;
   await emitReportableChange(tx,{eventType:EventTypes.SiteIntelligenceProcessingRequested,sourceId:inputId,sourceVersion:token,occurredAt:now,actorPersonId:actor.actorPersonId,dimensions:{organizationId,siteId:data.siteId},payload:{attempt}});
   return {kind:"claimed" as const,inputId,attempt};
 });
 if(claim.kind==="failed")return {status:"failed" as const,code:claim.code,message:claim.message};
 if(claim.kind!=="claimed")return {status:claim.kind};
 let failureStage="provider";
 const fence=and(scope(data.siteId,organizationId),eq(inputs.id,claim.inputId),eq(inputs.status,"processing"),eq(inputs.leaseToken,token));
 try{
   const result=await generateSitePackageWithGloo(before.input);
   failureStage="authorization";
   const currentActor=await resolveActor();
   if(currentActor.actorPersonId!==actor.actorPersonId||currentActor.accountId!==actor.accountId||currentActor.grantId!==actor.grantId||currentActor.sessionId!==actor.sessionId)throw new AuthorizationError("Site Intelligence authorization changed");
   failureStage="persistence";
   await db.transaction(async tx=>{
     await lockSite(tx,data.siteId,organizationId);
     // No stale result can replace a more recent claim or be made available
     // after source/consent changed during inference.
     const checked=await prepare(currentActor,data,tx);
     if(checked.digest!==data.digest||checked.brief.organizationId!==organizationId)throw new Error("Site source changed during processing");
     const [row]=await tx.update(inputs).set({status:"ready",leaseToken:null,leaseUntil:null,errorCode:null,updatedAt:new Date()}).where(and(fence,gt(inputs.leaseUntil,new Date()))).returning({id:inputs.id});
     if(!row)throw new Error("Site Intelligence processing lease expired");
     const outputDigest=hash(result.content);
     const [saved]=await tx.insert(outputs).values({siteId:data.siteId,organizationId,intelligenceVersionId:row.id,content:result.content,outputDigest,provider:"gloo",model:result.model,providerResponseId:result.providerResponseId}).returning({id:outputs.id});
     if(!saved)throw new Error("Site Intelligence output missing");
     await emitReportableChange(tx,{eventType:EventTypes.SiteIntelligenceProcessingCompleted,sourceId:row.id,sourceVersion:token,occurredAt:new Date(),actorPersonId:currentActor.actorPersonId,dimensions:{organizationId,siteId:data.siteId},payload:{attempt:claim.attempt,outputId:saved.id}});
     await writeAudit(tx,currentActor,{action:"site.content_generation.completed",entityType:"site",entityId:data.siteId,scope:{siteId:data.siteId,organizationId},after:{inputId:row.id,outputId:saved?.id,inputDigest:data.digest,outputDigest,model:result.model}});
   });
   return {status:"ready" as const};
 }catch(error){
   const safe=safeGlooFailure(error);
   const failure=safe.code==="processing_failed"?{code:"processing_"+failureStage,message:"Site Intelligence failed during "+failureStage+". Contact support."}:safe;
   console.error("Site Intelligence failure", {siteId:data.siteId,inputId:claim.inputId,stage:failureStage,code:failure.code,errorType:error instanceof Error?error.name:"unknown"});
   await db.transaction(async tx=>{
     const [failed]=await tx.update(inputs).set({status:"failed",leaseToken:null,leaseUntil:null,errorCode:failure.code,updatedAt:new Date()}).where(fence).returning({id:inputs.id});
     if(failed)await emitReportableChange(tx,{eventType:EventTypes.SiteIntelligenceProcessingFailed,sourceId:failed.id,sourceVersion:token,occurredAt:new Date(),actorPersonId:actor.actorPersonId,dimensions:{organizationId,siteId:data.siteId},payload:{attempt:claim.attempt}});
     if(failed)await writeAudit(tx,actor,{action:"site.content_generation.failed",entityType:"site",entityId:data.siteId,scope:{siteId:data.siteId,organizationId},after:{inputId:failed.id,inputDigest:data.digest,errorCode:failure.code}});
   });
   return {status:"failed" as const,...failure};
 }
}

/** Administration callers verify an independent non-demo platform grant before entering these operations. No editorial input or generated content is returned. */
export async function listLegacyGlooFailures(){
 return db.select({inputId:inputs.id,siteId:sites.id,siteName:sites.name,revision:inputs.revision,attempts:inputs.attempts}).from(inputs).innerJoin(sites,and(eq(inputs.siteId,sites.id),eq(inputs.organizationId,sites.organizationId))).where(and(eq(inputs.status,"failed"),eq(inputs.attempts,3),eq(inputs.errorCode,"processing_failed"))).orderBy(desc(inputs.updatedAt)).limit(100);
}
export async function authorizeLegacyGlooRetry(actor:AccessContext,data:{siteId:string;inputId:string}){
 assertActor(actor);
 if(!actor.capabilities.has("platform.admin")||actor.delegationMode||actor.sessionAccountId)throw new AuthorizationError("Platform administration");
 assertGlooConfiguration();
 return db.transaction(async tx=>{
   const [site]=await tx.select({id:sites.id,organizationId:sites.organizationId}).from(sites).where(eq(sites.id,data.siteId)).for("update");
   if(!site)throw new Error("Site not found.");
   const scoped=scope(site.id,site.organizationId);
   const [active]=await tx.select({id:inputs.id}).from(inputs).where(and(scoped,eq(inputs.status,"processing"),gt(inputs.leaseUntil,new Date()))).limit(1);
   if(active)return {ok:false as const,message:"Content generation is already in progress."};
   const [row]=await tx.select({id:inputs.id,status:inputs.status,attempts:inputs.attempts,errorCode:inputs.errorCode,updatedAt:inputs.updatedAt}).from(inputs).where(and(scoped,eq(inputs.id,data.inputId))).limit(1);
   if(!row||!legacyGlooRetryEligible(row))return {ok:false as const,message:"This legacy failure is no longer eligible for recovery."};
   const [saved]=await tx.update(inputs).set({attempts:2,errorCode:"legacy_retry_authorized",updatedAt:new Date()}).where(and(scoped,eq(inputs.id,row.id),eq(inputs.status,"failed"),eq(inputs.attempts,3),eq(inputs.errorCode,"processing_failed"))).returning({id:inputs.id});
   if(!saved)return {ok:false as const,message:"Retry eligibility changed."};
   await writeAudit(tx,actor,{action:"site.content_generation.legacy_retry_authorized",entityType:"site",entityId:site.id,scope:{siteId:site.id,organizationId:site.organizationId},before:{inputId:row.id,attempts:3,errorCode:row.errorCode},after:{inputId:row.id,attempts:2,errorCode:"legacy_retry_authorized",additionalAttemptGranted:1}});
   return {ok:true as const,message:"One diagnostic retry authorized. The Site editor must initiate it; no Site data was sent."};
 });
}

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
import {generateSitePackageWithGloo} from "./gloo-content-provider.server";
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
export async function previewSitePackage(actor:AccessContext,data:Request){
 const {brief,input,digest}=await prepare(actor,data);
 return {input,digest,sourceRevisions:brief.sourceRevisions};
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
   if(!brief.consent.contentReuseAllowed)return {status:"consent-required" as const,package:null};
   const scoped=scope(siteId,brief.organizationId);
   const [latest]=await tx.select({status:inputs.status,leaseUntil:inputs.leaseUntil,attempts:inputs.attempts,revision:inputs.revision}).from(inputs).where(scoped).orderBy(desc(inputs.revision)).limit(1);
   const rows=await tx.select({source:inputs,result:outputs}).from(inputs).innerJoin(outputs,and(eq(outputs.intelligenceVersionId,inputs.id),eq(outputs.siteId,inputs.siteId),eq(outputs.organizationId,inputs.organizationId))).where(and(scoped,eq(inputs.status,"ready"))).orderBy(desc(inputs.updatedAt),desc(inputs.revision)).limit(20);
   for(const {source,result} of rows){
     const saved=safeStoredInput(source);
     const current=buildSitePackageInput(brief,siteGenerationOptionsSchema.parse(source.options));
     if(!privatePackageSourcesMatch(saved,current))continue;
     // A change in identity can invalidate faith-specific copy.
     if(canonicalJson(saved.site.identity)!==canonicalJson(current.site.identity))continue;
     if(hash(saved)!==source.inputDigest||hash(result.content)!==result.outputDigest)throw new Error("Stored Site Intelligence integrity check failed.");
     const content=parseSiteContentPackage(canonicalJson(result.content),saved);
     return {status:"ready" as const,latestStatus:latest?.status??"ready",package:{id:result.id,revision:source.revision,generatedAt:result.createdAt.toISOString(),language:saved.preferences.language,stale:hash(current)!==source.inputDigest,website:consumer==="website"?content.website:null,marketing:consumer==="outreach"?content.marketing:null,reviewNotes:content.reviewNotes}};
   }
   return {status:latest?.status==="processing"&&latest.leaseUntil&&latest.leaseUntil>new Date()?"processing" as const:latest?"refresh-required" as const:"not-generated" as const,package:null};
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
   const [existing]=await tx.select().from(inputs).where(and(scoped,eq(inputs.inputDigest,data.digest))).limit(1);
   const now=new Date();
   if(existing?.status==="ready"){
     // Re-select the prior successful package without another provider call.
     await tx.update(inputs).set({updatedAt:now}).where(eq(inputs.id,existing.id));
     await writeAudit(tx,actor,{action:"site.content_generation.reused",entityType:"site",entityId:data.siteId,scope:{siteId:data.siteId,organizationId},after:{inputId:existing.id,inputDigest:data.digest}});
     return {kind:"reused" as const};
   }
   // Site-wide concurrency and cost controls, including abandoned leases.
   const [active]=await tx.select({id:inputs.id}).from(inputs).where(and(scoped,eq(inputs.status,"processing"),gt(inputs.leaseUntil,now))).limit(1);
   if(active)return {kind:"processing" as const};
   const [usage]=await tx.select({count:sql<number>`count(*)::int`}).from(inputs).where(and(scoped,gt(inputs.createdAt,new Date(now.getTime()-86400000))));
   if(!existing&&(usage?.count??0)>=5)throw new Error("Daily Site Intelligence generation limit reached.");
   if(existing&&existing.attempts>=3)throw new Error("Retry limit reached for this input.");
   const leaseUntil=new Date(now.getTime()+leaseMs);
   let inputId:string;
   if(existing){
     await tx.update(inputs).set({status:"processing",attempts:existing.attempts+1,leaseToken:token,leaseUntil,errorCode:null,updatedAt:now}).where(eq(inputs.id,existing.id));
     inputId=existing.id;
   }else{
     const [last]=await tx.select({revision:inputs.revision}).from(inputs).where(scoped).orderBy(desc(inputs.revision)).limit(1);
     const [row]=await tx.insert(inputs).values({siteId:data.siteId,organizationId,revision:(last?.revision??0)+1,inputDigest:data.digest,input:checked.input,options:data.options,sourceRevisions:checked.brief.sourceRevisions,requestedByPersonId:actor.actorPersonId!,status:"processing",attempts:1,leaseToken:token,leaseUntil}).returning({id:inputs.id});
     if(!row)throw new Error("Could not claim Site Intelligence input");
     inputId=row.id;
   }
   await writeAudit(tx,actor,{action:"site.content_generation.requested",entityType:"site",entityId:data.siteId,scope:{siteId:data.siteId,organizationId},after:{inputId,inputDigest:data.digest,provider:"gloo",externalProcessingConfirmed:true}});
   return {kind:"claimed" as const,inputId};
 });
 if(claim.kind!=="claimed")return {status:claim.kind};
 const fence=and(scope(data.siteId,organizationId),eq(inputs.id,claim.inputId),eq(inputs.status,"processing"),eq(inputs.leaseToken,token));
 try{
   const result=await generateSitePackageWithGloo(before.input);
   const currentActor=await resolveActor();
   if(currentActor.actorPersonId!==actor.actorPersonId||currentActor.accountId!==actor.accountId||currentActor.grantId!==actor.grantId||currentActor.sessionId!==actor.sessionId)throw new AuthorizationError("Site Intelligence authorization changed");
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
     await writeAudit(tx,currentActor,{action:"site.content_generation.completed",entityType:"site",entityId:data.siteId,scope:{siteId:data.siteId,organizationId},after:{inputId:row.id,outputId:saved?.id,inputDigest:data.digest,outputDigest,model:result.model}});
   });
   return {status:"ready" as const};
 }catch{
   await db.transaction(async tx=>{
     const [failed]=await tx.update(inputs).set({status:"failed",leaseToken:null,leaseUntil:null,errorCode:"processing_failed",updatedAt:new Date()}).where(fence).returning({id:inputs.id});
     if(failed)await writeAudit(tx,actor,{action:"site.content_generation.failed",entityType:"site",entityId:data.siteId,scope:{siteId:data.siteId,organizationId},after:{inputId:failed.id,inputDigest:data.digest,errorCode:"processing_failed"}});
   });
   throw new Error("Site Intelligence processing failed. Existing content is unchanged.");
 }
}

import {test,expect,request,type APIRequestContext} from "@playwright/test";
import {randomUUID} from "node:crypto";
import {z} from "zod";
import {authenticateQaActor,qaSession} from "../helpers/pilot-standard-access";
const uuid=z.string().uuid();
const actor=z.object({email:z.string().email().refine(v=>v===v.toLowerCase()&&v.endsWith(".test")),grantId:uuid,personId:uuid,organizationId:uuid,siteId:uuid,role:z.enum(["room_facilitator","site_admin","registrar"])}).strict();
const scope=z.object({deploymentId:uuid,courseVersionId:uuid,siteId:uuid,adoptionId:uuid}).strict();
const fixture=z.object({
 attestation:z.literal("reviewed-isolated-rehearsal-fixture"),
 facilitator:actor,manager:actor,foreign:actor,classId:uuid,
 scope,lessonId:uuid,assetVersionId:uuid,
}).strict().refine(v=>v.facilitator.role==="room_facilitator"&&v.manager.role!=="room_facilitator"&&
 v.facilitator.organizationId===v.manager.organizationId&&v.facilitator.siteId===v.manager.siteId&&v.scope.siteId===v.manager.siteId&&
 v.foreign.organizationId!==v.manager.organizationId&&v.foreign.siteId!==v.manager.siteId&&
 new Set([v.facilitator.personId,v.manager.personId,v.foreign.personId]).size===3&&
 new Set([v.facilitator.email,v.manager.email,v.foreign.email]).size===3
).parse(JSON.parse(process.env.CAN_REHEARSAL_QA_JSON??"{}"));
const origin="http://localhost:3001",api=origin+"/api/v1",headers={Origin:origin};
test("ordinary facilitator and manager sessions exercise rehearsal and deny foreign Class authority",async()=>{
 const contexts:APIRequestContext[]=[];
 async function login(a:z.infer<typeof actor>){
  const http=await request.newContext();contexts.push(http);
  const initial=await authenticateQaActor({request:http},a.email,undefined,"nest");
  expect(initial.grants.find(g=>g.id===a.grantId)).toMatchObject({personId:a.personId,organizationId:a.organizationId,siteId:a.siteId,role:a.role});
  expect((await http.post(api+"/me/session/membership",{headers,data:{grantId:a.grantId}})).status()).toBe(204);
  expect((await qaSession({request:http},"nest")).activeGrantId).toBe(a.grantId);
  return http;
 }
 try{
  const facilitator=await login(fixture.facilitator),manager=await login(fixture.manager),foreign=await login(fixture.foreign);
  const classPath=api+"/classes/"+fixture.classId,base=api+"/classroom-rehearsal";
  const teaching=await facilitator.get(classPath+"/workspace?view=teach");expect(teaching.status()).toBe(200);
  expect(await teaching.json()).toMatchObject({classId:fixture.classId,view:"teach",staffRole:"facilitator",canControlRoom:true});
  expect((await facilitator.get(classPath+"/roster")).status()).toBe(403);
  const managing=await manager.get(classPath+"/workspace?view=manage");expect(managing.status()).toBe(200);
  expect(await managing.json()).toMatchObject({classId:fixture.classId,view:"manage",canViewRoster:true});
  const roster=await manager.get(classPath+"/roster?offset=0");expect(roster.status()).toBe(200);
  const shape=z.object({members:z.array(z.object({enrollmentId:uuid,personId:uuid})).max(50),total:z.number().int().nonnegative(),nextOffset:z.number().int().nonnegative().nullable()}).parse(await roster.json());
  expect(shape.members.length).toBeLessThanOrEqual(shape.total);
  expect((await manager.get(classPath+"/roster?offset=-1")).status()).toBe(400);
  expect((await foreign.get(classPath+"/workspace?view=teach")).status()).toBe(403);
  expect((await foreign.get(classPath+"/roster")).status()).toBe(403);
  const choices=await facilitator.get(base+"/choices");expect(choices.status()).toBe(200);
  const listed=z.object({choices:z.array(scope.passthrough()),partial:z.boolean()}).parse(await choices.json());
  expect(listed.choices).toEqual(expect.arrayContaining([expect.objectContaining(fixture.scope)]));
  const params=new URLSearchParams(fixture.scope).toString();
  const media=await facilitator.get(base+"/media?"+params);expect(media.status()).toBe(200);
  const candidates=z.object({media:z.array(z.object({lessonId:uuid,assetVersionId:uuid,trackVersionId:uuid})).max(25),note:z.string()}).parse(await media.json());
  expect(candidates.media).toEqual(expect.arrayContaining([expect.objectContaining({lessonId:fixture.lessonId,assetVersionId:fixture.assetVersionId})]));
  expect((await foreign.get(base+"/media?"+params)).status()).toBe(403);
  const payload={...fixture.scope,lessonId:fixture.lessonId,assetVersionId:fixture.assetVersionId};
  const access=await facilitator.post(base+"/media-access",{headers,data:payload});expect(access.status()).toBe(200);
  // Do not log or attach signed links.
  const accessBody=z.object({downloadUrl:z.string().url(),expiresInSeconds:z.union([z.literal(0),z.literal(30)])}).parse(await access.json());
  expect(new URL(accessBody.downloadUrl).protocol).toBe("https:");
  expect((await foreign.post(base+"/media-access",{headers,data:payload})).status()).toBe(403);
  const event={...payload,requestId:randomUUID(),kind:"played"};
  expect((await foreign.post(base+"/playback-events",{headers,data:event})).status()).toBe(403);
  const first=await facilitator.post(base+"/playback-events",{headers,data:event});expect(first.status()).toBe(200);
  expect(await first.json()).toEqual({saved:true,duplicate:false,rehearsalOnly:true});
  const replay=await facilitator.post(base+"/playback-events",{headers,data:event});expect(replay.status()).toBe(200);
  expect(await replay.json()).toEqual({saved:false,duplicate:true,rehearsalOnly:true});
  expect((await facilitator.post(base+"/playback-events",{headers,data:{...event,kind:"paused"}})).status()).toBe(409);
  expect((await facilitator.post(base+"/playback-events",{headers,data:{...event,courseAttemptId:randomUUID()}})).status()).toBe(400);
  for(const http of contexts)expect((await http.post(api+"/access/logout",{headers,data:{}})).status()).toBe(204);
 }finally{await Promise.all(contexts.map(http=>http.dispose()));}
});

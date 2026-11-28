import {test,expect} from "@playwright/test";
import {neon} from "@neondatabase/serverless";
import {z} from "zod";
import {NestQaClient,uuid,query} from "../helpers/nest-qa-client";
import {qaSession} from "../helpers/pilot-standard-access";
const manager=z.object({email:z.string().email().refine(v=>v===v.toLowerCase()&&v.endsWith(".demo")),grantId:uuid,personId:uuid,organizationId:uuid}).strict();
const fixture=z.object({attestation:z.literal("reviewed-synthetic-relationship-managers"),owner:manager,recipient:manager,foreign:manager,siteId:uuid,classId:uuid,from:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),to:z.string().regex(/^\d{4}-\d{2}-\d{2}$/)}).strict().superRefine((f,ctx)=>{
 const actors=[f.owner,f.recipient,f.foreign];
 if(["email","grantId","personId","organizationId"].some(k=>new Set(actors.map(a=>a[k as keyof typeof a])).size!==3)||!(Date.parse(f.from)<Date.parse(f.to))||Date.parse(f.to)-Date.parse(f.from)>366*86400000)
  ctx.addIssue({code:z.ZodIssueCode.custom,message:"Distinct reviewed organizations and direct managers required"});
}).parse(JSON.parse(process.env.CAN_NEST_RELATIONSHIPS_QA_JSON||"null"));
const portfolioPath="/me/reporting-relationship-portfolio";
const portfolio=z.object({population:z.literal("synthetic"),acceptedRelationships:z.number().int(),acceptedWithReportingTerms:z.number().int(),awaitingOurResponse:z.number().int(),awaitingPartnerResponse:z.number().int()});
const metrics=[{metricKey:"class.registrations",definitionVersion:"0.1.0"}];
test("relationship terms require independent recipient consent and do not grant access to private reports",async()=>{
 const clients:NestQaClient[]=[];
 const sql=neon(process.env.TEST_DATABASE_URL!);
 const [db]=await sql`SELECT current_setting('neon.project_id',true) AS project,current_setting('neon.branch_id',true) AS branch`;
 expect(db).toEqual({project:"sweet-hall-62441909",branch:"br-solitary-art-arun91gj"});
 const codes=[process.env.CAN_NEST_RELATIONSHIP_OWNER_CODE,process.env.CAN_NEST_RELATIONSHIP_RECIPIENT_CODE,process.env.CAN_NEST_RELATIONSHIP_FOREIGN_CODE];
 if(codes.some(c=>!c||!/^[A-Za-z0-9_-]{43}$/.test(c))||new Set(codes).size!==3)throw Error("Three existing individual credentials required; never use fixed demo code");
 async function open(actor:z.infer<typeof manager>,code:string){
  const c=await NestQaClient.create();clients.push(c);
  // Ordinary private access credential, not a special QA endpoint.
  const response=await c.http.post("http://localhost:3001/api/v1/access/verify",{headers:{Origin:"http://localhost:3001"},data:{email:actor.email,code},maxRedirects:0});
  if(response.status()!==200)throw Error("Reviewed individual credential rejected");
  const session=await qaSession({request:c.http},"nest");
  expect(session.grants.find(g=>g.id===actor.grantId)).toMatchObject({personId:actor.personId,organizationId:actor.organizationId,siteId:null,role:"reporting_relationship_manager"});
  await c.post("/me/session/membership",{grantId:actor.grantId},204);
  expect((await qaSession({request:c.http},"nest")).activeGrantId).toBe(actor.grantId);
  return c;
 }
 try{
  const [scope]=await sql`SELECT count(*)::int AS count FROM public.classes c JOIN public.sites s ON s.id=c.site_id JOIN public.organizations o ON o.id=s.organization_id WHERE c.id=${fixture.classId}::uuid AND s.id=${fixture.siteId}::uuid AND o.id=${fixture.owner.organizationId}::uuid AND o.domain LIKE '%.demo' AND o.metadata->>'qa_only'='true' AND o.metadata->>'intended_branch'='br-solitary-art-arun91gj'`;
  expect(scope?.count).toBe(1);
  for(const a of [fixture.owner,fixture.recipient,fixture.foreign]){
   const [verified]=await sql`SELECT count(*)::int AS count FROM public.organizations o JOIN public.people p ON p.id=${a.personId}::uuid WHERE o.id=${a.organizationId}::uuid AND o.domain LIKE '%.demo' AND o.metadata->>'qa_only'='true' AND p.metadata->>'qa_only'='true' AND o.metadata->>'intended_branch'='br-solitary-art-arun91gj' AND p.metadata->>'intended_branch'='br-solitary-art-arun91gj'`;
   expect(verified?.count).toBe(1);
  }
  const [owner,recipient,foreign]=await Promise.all([open(fixture.owner,codes[0]!),open(fixture.recipient,codes[1]!),open(fixture.foreign,codes[2]!)]);
  const read=async(c:NestQaClient)=>portfolio.parse(await c.get(portfolioPath));
  const before=await read(recipient);
  const report=query("/classes/"+fixture.classId+"/report",{from:fixture.from,to:fixture.to});
  await recipient.deny("GET",report);await foreign.deny("GET",report);
  const input={recipientOrganizationId:fixture.recipient.organizationId,scopeKind:"site",scopeId:fixture.siteId,relationshipKind:"affiliation",metrics,validThrough:null};
  await foreign.deny("POST","/reporting-relationships",input);
  const proposal=z.object({id:uuid,status:z.literal("pending")}).strict().parse(await owner.post("/reporting-relationships",input));
  expect((await read(recipient)).awaitingOurResponse).toBe(before.awaitingOurResponse+1);
  const accept={agreementId:proposal.id,action:"accept"};
  await owner.deny("POST","/reporting-relationship-decisions",accept);
  await foreign.deny("POST","/reporting-relationship-decisions",accept);
  expect(await recipient.post("/reporting-relationship-decisions",accept)).toEqual({id:proposal.id,status:"accepted"});
  const accepted=await read(recipient);
  expect(accepted.acceptedRelationships).toBe(before.acceptedRelationships+1);
  expect(accepted.acceptedWithReportingTerms).toBe(before.acceptedWithReportingTerms+1);
  expect(accepted.awaitingOurResponse).toBe(before.awaitingOurResponse);
  // Accepted terms do not release provider-private metrics or imply publication.
  await recipient.deny("GET",report);await foreign.deny("GET",report);
  await foreign.deny("POST","/reporting-relationship-decisions",{agreementId:proposal.id,action:"revoke"});
  expect(await owner.post("/reporting-relationship-decisions",{agreementId:proposal.id,action:"revoke"})).toEqual({id:proposal.id,status:"revoked"});
  const revoked=await read(recipient);
  expect(revoked.acceptedRelationships).toBe(before.acceptedRelationships);
  expect(revoked.acceptedWithReportingTerms).toBe(before.acceptedWithReportingTerms);
  await recipient.deny("GET",report);
  const [persisted]=await sql`SELECT status,metrics,data_population,owner_organization_id::text AS owner,recipient_organization_id::text AS recipient,scope_id::text AS scope FROM public.reporting_relationship_agreements WHERE id=${proposal.id}::uuid`;
  expect(persisted).toEqual({status:"revoked",metrics,data_population:"synthetic",owner:fixture.owner.organizationId,recipient:fixture.recipient.organizationId,scope:fixture.siteId});
  for(const c of clients)await c.logout();
 }finally{await Promise.all(clients.map(c=>c.close()));}
});

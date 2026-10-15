import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq } from "drizzle-orm";

const STUDENT = "f1000000-0000-4000-8000-000000000007";
const TEACHER = "f1000000-0000-4000-8000-000000000006";
const SITE = "f1000000-0000-4000-8000-000000000003";
const ORG = "f1000000-0000-4000-8000-000000000002";
const PROGRAM = "f1000000-0000-4000-8000-000000000004";
const WORKERS = {
 academic: "f4100000-0000-4000-8000-000000000001",
 learning: "f4100000-0000-4000-8000-000000000002",
 counselor: "f4100000-0000-4000-8000-000000000003",
 planning: "f4100000-0000-4000-8000-000000000004",
} as const;
type Area = keyof typeof WORKERS;
type Stage = "submitted"|"accepted"|"plan_created"|"in_service"|"review"|"closed";
const stages:Stage[]=["submitted","accepted","plan_created","in_service","review","closed"];
const categories=["academic","attendance","learning","personal","planning"] as const;
type Category = typeof categories[number];
const destination:Record<Category,Area>={academic:"academic",attendance:"academic",learning:"learning",personal:"counselor",planning:"planning"};
function isReferral(x:Record<string,unknown>) {return x.synthetic===true && x.fixture==="gf41" && typeof x.stage==="string";}
function safeNote(input:string,max=1500){const s=input.trim();if(s.length<3||s.length>max)throw new Error(`Notes must be 3–${max} characters`);return s;}
const stagePriority=(x:Stage)=>stages.indexOf(x);

export const getSupportReferrals=createServerFn({method:"GET"}).handler(async()=>{
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const [rows,workers]=await Promise.all([
  db.select({id:s.actions.id,title:s.actions.title,description:s.actions.description,status:s.actions.status,
   priority:s.actions.priority,metadata:s.actions.metadata,ownerPersonId:s.actions.ownerPersonId,createdAt:s.actions.createdAt})
   .from(s.actions).where(and(eq(s.actions.type,"support_referral"),eq(s.actions.subjectId,STUDENT),eq(s.actions.siteId,SITE)))
   .orderBy(desc(s.actions.createdAt)).limit(100),
  db.select({id:s.people.id,firstName:s.people.legalFirstName,lastName:s.people.legalLastName}).from(s.people),
 ]);
 const names=new Map(workers.map(w=>[w.id,`${w.firstName} ${w.lastName}`]));
 return rows.filter(x=>isReferral(x.metadata)).map(row=>{
  const meta=row.metadata;
  return {id:row.id,title:row.title,description:row.description??"",status:row.status,
   priority:row.priority,stage:String(meta.stage),category:String(meta.category),
   notes:typeof meta.notes==="string"?meta.notes:"",
   academicRecommendation:typeof meta.academicRecommendation==="string"?meta.academicRecommendation:"",
   nextReview:typeof meta.nextReview==="string"?meta.nextReview:"",
   assignedTo:row.ownerPersonId?names.get(row.ownerPersonId)??"Unassigned":"Unassigned",
   ownerPersonId:row.ownerPersonId,createdAt:row.createdAt.toISOString()};
 });
});

export const createSupportReferral=createServerFn({method:"POST"})
 .validator((v:{category:Category;priority:"normal"|"high";observations:string;includeEvidence:boolean})=>v)
 .handler(async({data})=>{
  if(!categories.includes(data.category))throw new Error("Invalid referral category");
  const observations=safeNote(data.observations);
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  const [created]=await db.insert(s.actions).values({
   type:"support_referral",status:"open",priority:data.priority,
   title:`Student support · ${data.category}`,description:observations,
   ownerPersonId:null,organizationId:ORG,siteId:SITE,programId:PROGRAM,
   subjectType:"student_profile",subjectId:STUDENT,
   metadata:{synthetic:true,fixture:"gf41",category:data.category,stage:"submitted",
    source:"teacher",reporterPersonId:TEACHER,requestedArea:destination[data.category],
    includeEvidence:data.includeEvidence,notes:observations,academicRecommendation:"",history:[{stage:"submitted",actor:TEACHER,at:new Date().toISOString()}]},
  }).returning({id:s.actions.id});
  if(!created)throw new Error("Referral not created");
  return {referralId:created.id};
 });

export const advanceSupportReferral=createServerFn({method:"POST"})
 .validator((v:{referralId:string;nextStage:Stage;note:string;area?:Area;nextReview?:string})=>v)
 .handler(async({data})=>{
  if(!stages.includes(data.nextStage))throw new Error("Invalid referral stage");
  const note=safeNote(data.note);
  const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
  return db.transaction(async tx=>{
   const [record]=await tx.select().from(s.actions).where(and(eq(s.actions.id,data.referralId),eq(s.actions.type,"support_referral"),eq(s.actions.siteId,SITE),eq(s.actions.subjectId,STUDENT))).for("update").limit(1);
   if(!record||!isReferral(record.metadata))throw new Error("Synthetic referral not found");
   const previous=record.metadata.stage as Stage;
   if(data.nextStage==="closed"&&previous!=="review")throw new Error("Referral must be reviewed before closure");
   if(data.nextStage!=="closed"&&stagePriority(data.nextStage)!==stagePriority(previous)+1)throw new Error("Invalid lifecycle transition");
   const area=data.area??(record.metadata.requestedArea as Area);
   const owner=WORKERS[area];
   if(!owner)throw new Error("Choose a valid specialist");
   const historical=Array.isArray(record.metadata.history)?record.metadata.history:[];
   const metadata={...record.metadata,stage:data.nextStage,
    notes:data.nextStage==="accepted"?record.metadata.notes:record.metadata.notes,
    academicRecommendation:data.nextStage==="review"?note:record.metadata.academicRecommendation,
    nextReview:data.nextReview??record.metadata.nextReview,
    history:[...historical,{stage:data.nextStage,at:new Date().toISOString(),note,actor:owner}]};
   await tx.update(s.actions).set({status:data.nextStage==="closed"?"resolved":"in_progress",
    ownerPersonId:owner,metadata,resolvedAt:data.nextStage==="closed"?new Date():null,
    resolutionNote:data.nextStage==="closed"?note:null,updatedAt:new Date()}).where(eq(s.actions.id,record.id));
   if(data.nextStage==="accepted"){
    await tx.insert(s.notifications).values({recipientPersonId:TEACHER,type:"support_referral_accepted",
     title:"Student support referral accepted",body:"A specialist has accepted your referral.",
     resourceType:"action",resourceId:record.id});
   }
   if(data.nextStage==="review"){
    await tx.insert(s.notifications).values({recipientPersonId:TEACHER,type:"support_referral_update",
     title:"Academic support update",body:note.slice(0,400),
     resourceType:"action",resourceId:record.id});
   }
   return {stage:data.nextStage};
  });
 });

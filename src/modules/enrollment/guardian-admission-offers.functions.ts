import {createServerFn} from "@tanstack/react-start";
import {getRequest,setResponseHeader} from "@tanstack/react-start/server";
import {getCommandContext} from "@/modules/identity/command-context.server";
import {AuthorizationError,assertCapability} from "@/domain/command-context";
import {and,eq,inArray,desc} from "drizzle-orm";

/** Only offers for students whose enrollment this session's guardian can manage. */
export const getGuardianSyntheticAdmissionOffers=createServerFn({method:"GET"}).handler(async()=>{
 const actor=await getCommandContext(getRequest());
 setResponseHeader("Cache-Control","private, no-store");
 if(actor.role!=="guardian"||!actor.actorPersonId)throw new AuthorizationError("guardian enrollment offers");
 assertCapability(actor,"enrollment.apply");
 const [{db},s]=await Promise.all([import("@/db/client"),import("@/db/schema")]);
 const relations=await db.select({studentPersonId:s.guardianRelationships.studentPersonId}).from(s.guardianRelationships)
  .where(and(eq(s.guardianRelationships.guardianPersonId,actor.actorPersonId),eq(s.guardianRelationships.canManageEnrollment,true)));
 if(!relations.length)return [];
 const profiles=await db.select({id:s.studentProfiles.id,personId:s.studentProfiles.personId}).from(s.studentProfiles)
  .where(inArray(s.studentProfiles.personId,relations.map(r=>r.studentPersonId)));
 if(!profiles.length)return [];
 const students=await db.select({profileId:s.studentProfiles.id,firstName:s.people.legalFirstName,lastName:s.people.legalLastName})
  .from(s.studentProfiles).innerJoin(s.people,eq(s.people.id,s.studentProfiles.personId))
  .where(inArray(s.studentProfiles.id,profiles.map(p=>p.id)));
 const nameByProfile=new Map(students.map(p=>[p.profileId,[p.firstName,p.lastName].filter(Boolean).join(" ")]));
 const apps=await db.select({id:s.applications.id,programId:s.applications.programId,studentProfileId:s.applications.studentProfileId,metadata:s.applications.metadata,programName:s.programs.name})
  .from(s.applications).innerJoin(s.programs,eq(s.programs.id,s.applications.programId))
  .where(inArray(s.applications.studentProfileId,profiles.map(p=>p.id)));
 const permitted=apps.filter(app=>app.metadata.synthetic===true&&actor.scope.programIds?.includes(app.programId));
 if(!permitted.length)return [];
 const offers=await db.select({id:s.admissionOffers.id,applicationId:s.admissionOffers.applicationId,status:s.admissionOffers.status,expiresAt:s.admissionOffers.expiresAt,schoolYearId:s.admissionOffers.schoolYearId})
  .from(s.admissionOffers).where(inArray(s.admissionOffers.applicationId,permitted.map(a=>a.id)))
  .orderBy(desc(s.admissionOffers.createdAt)).limit(150);
 return permitted.map(app=>({applicationId:app.id,studentName:nameByProfile.get(app.studentProfileId)??"Student",program:app.programName,offers:offers.filter(o=>o.applicationId===app.id).map(o=>({id:o.id,status:o.status,expiresAt:o.expiresAt?.toISOString()??null,schoolYearId:o.schoolYearId}))}));
});

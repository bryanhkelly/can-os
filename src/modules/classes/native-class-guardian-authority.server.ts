import {and,eq,gt,inArray,isNull,lte,or} from "drizzle-orm";
import {db} from "@/db/client";
import {accessAccounts,guardianRelationships} from "@/db/schema";
import {guardianRelationshipPredicate,schoolGuardianAuthorityCompatible} from "@/domain/guardian-relationship";
import {canonicalPersons,guardianAuthorities,learnerProfiles} from "@/db/canonical-v301";
import {AuthorizationError,assertCapability} from "@/domain/command-context";
import {getIdentityContext} from "@/modules/identity/command-context.server";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Authenticate with ONE real CAN account and its immutable public Person.
 * Guardian authority over a particular child is independently verified by
 * requireNativeGuardianChild below, not by a second Person identity mapping.
 * Never derive parental access from a shared login, an organization role,
 * an email match, or an arbitrary selected child UUID.
 */
export async function requireNativeGuardian(request:Request,_now:Date){
 const actor=await getIdentityContext(request);
 if(actor.role!=="guardian"||!actor.actorPersonId||
    !actor.accountId||actor.sessionAccountId||actor.impersonatedByAccountId)
  throw new AuthorizationError("verified CAN guardian");
 assertCapability(actor,"enrollment.apply");
 const [account]=await db.select({
  personId:accessAccounts.personId,verified:accessAccounts.emailVerifiedAt,
  disabled:accessAccounts.disabled,
 }).from(accessAccounts).where(eq(accessAccounts.id,actor.accountId)).limit(1);
 if(account?.personId!==actor.actorPersonId||!account.verified||account.disabled)
  throw new AuthorizationError("current guardian account");
 return {personId:actor.actorPersonId};
}

/** Shared live authority predicate: expired, future and unrelated authority
 * types never enter the candidate set or consume its ambiguity limit. */
export function currentNativeGuardianAuthorityPredicate(guardianPersonId:string,now:Date,
 purpose:"enrollment"|"instruction"="enrollment"){
 return and(
  eq(guardianAuthorities.guardianPersonId,guardianPersonId),
  lte(guardianAuthorities.startsAt,now),
  lte(guardianAuthorities.verifiedAt,now),
  or(isNull(guardianAuthorities.endsAt),gt(guardianAuthorities.endsAt,now)),
  inArray(guardianAuthorities.authorityKind,purpose==="enrollment"?
   ["parent","legal_guardian","guardian","enrollment"]:["parent","legal_guardian","guardian"]),
 );
}

/** One native authority read shared by enrollment, communication and instruction.
 * Neither table grants permission on behalf of the other. An overlapping
 * inconsistent school relationship fails closed until independently reconciled. */
export async function requireCurrentNativeGuardianAuthority(
 tx:Tx,guardianPersonId:string,learnerPersonId:string,now:Date,
 purpose:"enrollment"|"instruction",
){
 const rows=await tx.select({
  id:guardianAuthorities.id,kind:guardianAuthorities.authorityKind,
  verifiedAt:guardianAuthorities.verifiedAt,
  birthDate:canonicalPersons.birthDate,
 }).from(guardianAuthorities)
 .innerJoin(learnerProfiles,eq(learnerProfiles.id,guardianAuthorities.learnerId))
 .innerJoin(canonicalPersons,eq(canonicalPersons.id,learnerProfiles.personId))
 .where(and(
  currentNativeGuardianAuthorityPredicate(guardianPersonId,now,purpose),
  eq(learnerProfiles.personId,learnerPersonId),
 )).for("share").limit(2);
 if(rows.length!==1)throw new AuthorizationError("current verified guardian authority");
 const [schoolRelationship]=await tx.select({
  metadata:guardianRelationships.metadata,
  canManageEnrollment:guardianRelationships.canManageEnrollment,
  canViewAcademics:guardianRelationships.canViewAcademics,
 }).from(guardianRelationships).where(guardianRelationshipPredicate({
  guardianPersonId,studentPersonId:learnerPersonId,access:"relationship",
 })).for("share").limit(1);
 if(!schoolGuardianAuthorityCompatible(schoolRelationship,purpose))
  throw new AuthorizationError("reconciled guardian authority");
 return rows[0]!;
}

/** Placement additionally requires verified minor age. */
export async function requireNativeGuardianChild(
 tx:Tx,guardianPersonId:string,learnerPersonId:string,now:Date,
){
 const authority=await requireCurrentNativeGuardianAuthority(tx,guardianPersonId,learnerPersonId,now,"enrollment");
 const birthDate=authority.birthDate;
 if(!birthDate||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(birthDate))
  throw new AuthorizationError("verified minor birth date");
 const [y,m,d]=birthDate.split("-").map(Number);
 const born=new Date(Date.UTC(y!,m!-1,d!));
 if(born.getUTCFullYear()!==y||born.getUTCMonth()!==m!-1||born.getUTCDate()!==d)
  throw new AuthorizationError("valid minor birth date");
 const age=now.getUTCFullYear()-y!-
  ((now.getUTCMonth()+1<m!||(now.getUTCMonth()+1===m!&&now.getUTCDate()<d!))?1:0);
 if(age<0||age>=18)throw new AuthorizationError("minor guardian placement only");
 return authority;
}

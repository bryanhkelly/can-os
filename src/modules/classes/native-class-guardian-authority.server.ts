import {and,eq,gt,lte,or} from "drizzle-orm";
import {db} from "@/db/client";
import {accessAccounts} from "@/db/schema";
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
    !actor.accountId||actor.sessionAccountId)
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

/** A current verified canonical guardian authority, not a caller-supplied
 * learner UUID, is required for placement.
 */
export async function requireNativeGuardianChild(
 tx:Tx,guardianPersonId:string,learnerPersonId:string,now:Date,
){
 const rows=await tx.select({
  id:guardianAuthorities.id,kind:guardianAuthorities.authorityKind,
  verifiedAt:guardianAuthorities.verifiedAt,
  birthDate:canonicalPersons.birthDate,
 }).from(guardianAuthorities)
 .innerJoin(learnerProfiles,eq(learnerProfiles.id,guardianAuthorities.learnerId))
 .innerJoin(canonicalPersons,eq(canonicalPersons.id,learnerProfiles.personId))
 .where(and(
  eq(guardianAuthorities.guardianPersonId,guardianPersonId),
  eq(learnerProfiles.personId,learnerPersonId),
  lte(guardianAuthorities.startsAt,now),
  or(isNull(guardianAuthorities.endsAt),gt(guardianAuthorities.endsAt,now)),
 )).limit(10);
 const matches=rows.filter(row=>row.verifiedAt&&row.verifiedAt<=now&&
  ["parent","legal_guardian","guardian","enrollment"].includes(row.kind));
 if(matches.length!==1)throw new AuthorizationError("current verified guardian authority");
 const birthDate=matches[0]!.birthDate;
 if(!birthDate||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(birthDate))
  throw new AuthorizationError("verified minor birth date");
 const [y,m,d]=birthDate.split("-").map(Number);
 const born=new Date(Date.UTC(y!,m!-1,d!));
 if(born.getUTCFullYear()!==y||born.getUTCMonth()!==m!-1||born.getUTCDate()!==d)
  throw new AuthorizationError("valid minor birth date");
 const age=now.getUTCFullYear()-y!-
  ((now.getUTCMonth()+1<m!||(now.getUTCMonth()+1===m!&&now.getUTCDate()<d!))?1:0);
 if(age<0||age>=18)throw new AuthorizationError("minor guardian placement only");
 return matches[0]!;
}

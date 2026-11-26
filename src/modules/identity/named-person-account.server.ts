import { and, eq, isNull, sql } from "drizzle-orm";
import type { db } from "@/db/client";
import { accessAccounts, accountPersonGrants, people } from "@/db/schema";
import { normalizeAccessEmail } from "@/domain/access-tokens";
import { identityEmailDomain, isDemoAccountEmail } from "@/domain/domain-classification";
import { AuthorizationError } from "@/domain/command-context";

type Tx=Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Resolve an explicitly authorized mailbox identity. This is not an email
 * verification or role assignment. The caller must authorize the proposed
 * relationship and preserve its own audit and invitation lifecycle. */
export async function provisionNamedMailboxPerson(tx:Tx,input:{
  email:string;firstName:string;lastName:string;
}){
  const email=normalizeAccessEmail(input.email);
  if(isDemoAccountEmail(email)||!identityEmailDomain(email)||email.endsWith(".invalid"))
    throw new AuthorizationError("mailbox credential required");
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${"person-account:"+email}))`);
  const created=await tx.insert(accessAccounts).values({emailNormalized:email})
    .onConflictDoNothing().returning({id:accessAccounts.id});
  const [account]=await tx.select({id:accessAccounts.id,personId:accessAccounts.personId,
    disabled:accessAccounts.disabled,privateCredential:sql<boolean>`(${accessAccounts.privateAccessCodeHash} IS NOT NULL)`})
    .from(accessAccounts).where(eq(accessAccounts.emailNormalized,email)).for("update").limit(1);
  if(!account||account.disabled||account.privateCredential)
    throw new AuthorizationError("current mailbox account");
  const prior=await tx.select({personId:accountPersonGrants.personId})
    .from(accountPersonGrants).where(eq(accountPersonGrants.accountId,account.id)).limit(101);
  const peopleIds=new Set(prior.map(row=>row.personId));
  if(account.personId)peopleIds.add(account.personId);
  if(prior.length>100||peopleIds.size>1)
    throw new AuthorizationError("unambiguous account Person");
  let personId=[...peopleIds][0];
  const personCreated=!personId;
  if(!personId){
    const [person]=await tx.insert(people).values({legalFirstName:input.firstName,
      legalLastName:input.lastName,email,domain:identityEmailDomain(email)})
      .returning({id:people.id});
    if(!person)throw new Error("Person could not be created");
    personId=person.id;
  }
  const [person]=await tx.select({active:people.active}).from(people)
    .where(eq(people.id,personId)).for("share").limit(1);
  if(!person?.active)throw new AuthorizationError("active canonical Person");
  if(!account.personId){
    const [bound]=await tx.update(accessAccounts).set({personId,updatedAt:new Date()})
      .where(and(eq(accessAccounts.id,account.id),isNull(accessAccounts.personId)))
      .returning({id:accessAccounts.id});
    if(!bound)throw new AuthorizationError("current account Person binding");
  }
  await tx.update(people).set({domain:identityEmailDomain(email),updatedAt:new Date()})
    .where(and(eq(people.id,personId),isNull(people.domain)));
  return {accountId:account.id,personId,email,accountCreated:created.length===1,personCreated};
}

import { identityEmailDomain, isDemoDomain } from "./domain-classification";

/** Credential possession is distinct from the operator's identity confirmation.
 * The caller must separately authorize the exact Site, role and current session. */
export function individualStaffIssuerEligible(issuer: {
  personId: string | null;
  disabled: boolean;
  email: string;
  emailVerifiedAt: Date | null;
  privateCredential: boolean;
  authenticationMethod: string | null;
} | undefined, actorPersonId: string): boolean {
  if (!issuer || issuer.disabled || issuer.personId !== actorPersonId) return false;
  if (issuer.privateCredential) {
    return isDemoDomain(identityEmailDomain(issuer.email)) &&
      issuer.authenticationMethod === "private_access_code";
  }
  const domain = identityEmailDomain(issuer.email);
  return domain !== null && !isDemoDomain(domain) && !!issuer.emailVerifiedAt &&
    (issuer.authenticationMethod === null || issuer.authenticationMethod === "email_link");
}

/** An operator must explicitly identify an existing Person. Public registration
 * must never be able to claim an existing identity or a pending invitation. */
export function individualStaffTargetEligible(account: {
  personId: string | null; disabled: boolean; privateCredential: boolean;
} | undefined, existingPersonId: string | undefined): boolean {
  return account
    ? !account.disabled && account.privateCredential && !!account.personId &&
      existingPersonId === account.personId
    : existingPersonId === undefined;
}

/** Credential selection only: a registered synthetic Site defaults to the
 * shared code. An existing private credential is never silently downgraded.
 * Out-of-scope non-deliverable identities still require independent approval. */
export function requiresIndividualStaffCredential(input:{
  demoIdentity:boolean; approvedSharedScope:boolean;
  existingPrivateCredential:boolean; confirmationProvided:boolean;
}):boolean {
  return input.demoIdentity && input.confirmationProvided &&
    (input.existingPrivateCredential || !input.approvedSharedScope);
}

import { isDemoAccountEmail } from "./domain-classification";

export type SessionAuthenticationMethod = "email_link" | "local_demo_code" | "private_access_code";

/** Session provenance and current Account credential state must agree.
 * Legacy null provenance remains compatible only with unconverted Accounts.
 * This does not grant a membership or attest a mailbox. */
export function sessionCredentialMode(input: {
  email: string;
  privateCredential: boolean;
  authenticationMethod?: SessionAuthenticationMethod | null;
}): "individual" | "legacy" | "denied" {
  const demoIdentity = isDemoAccountEmail(input.email);
  const method = input.authenticationMethod;
  if (input.privateCredential) {
    return demoIdentity && method === "private_access_code" ? "individual" : "denied";
  }
  if (method === "private_access_code" ||
      (method === "email_link" && demoIdentity) ||
      (method === "local_demo_code" && !demoIdentity)) return "denied";
  return method == null || method === "email_link" || method === "local_demo_code"
    ? "legacy" : "denied";
}

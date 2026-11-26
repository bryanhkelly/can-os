import { hashPrivateAccessCode, issueOpaqueSecret } from "@/domain/access-tokens";

/** Generate a credential for an already-authorized issuance workflow.
 * The caller persists only privateAccessCodeHash, inside its transaction.
 * Never log or emit the raw code; return it only to the authorized recipient.
 * This function conveys no identity, role, or resource authority. */
export function issuePrivateAccountCredential(pepper=process.env.CAN_ACCESS_TOKEN_PEPPER??"") {
  const privateAccessCode = issueOpaqueSecret();
  const privateAccessCodeHash = hashPrivateAccessCode(privateAccessCode,pepper);
  return { privateAccessCode, privateAccessCodeHash };
}

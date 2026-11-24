import {createHash} from "node:crypto";

/** Preserve the existing Native Class evidence byte contract. Noncredit
 * registration uses a different historical delimiter and is not interchangeable. */
export function nativeClassConsentDigest(version:string,text:string):string{
  return createHash("sha256").update(version).update("\u0000").update(text).digest("hex");
}

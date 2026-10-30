import { AuthorizationError, type CommandContext } from "./command-context";
/** Resource scope is resolved by the caller from actual memberships and assignments.
 * Never treat an arbitrary nonempty caller scope as proof of access to a target.
 */
export type ProfileField = "directory" | "education" | "credential" | "evidence" | "student";
export type ResolvedProfileAccess = {
  targetPersonId: string;
  authorizedRelationship: boolean;
  permittedFields: ReadonlySet<ProfileField>;
};
export function assertProfileRead(context: CommandContext,targetPersonId: string,field: ProfileField,resolved?: ResolvedProfileAccess):void {
  if(!context.actorPersonId) throw new AuthorizationError("authenticated profile access");
  if(context.actorPersonId===targetPersonId && (field==="directory"||field==="education"||field==="credential")) return;
  const capability=field==="directory"?"profiles.directory.read":field==="evidence"?"profiles.evidence.read":field==="student"?"student.read":"profiles.read";
  if(!context.capabilities.has(capability)) throw new AuthorizationError(capability);
  if(!resolved||resolved.targetPersonId!==targetPersonId||!resolved.authorizedRelationship||!resolved.permittedFields.has(field)) throw new AuthorizationError("verified profile relationship and field permission");
}
export function assertCredentialVerification(context: CommandContext,subjectPersonId:string,authorizedSubjectInScope=false):void {
  if(!context.actorPersonId||context.actorPersonId===subjectPersonId) throw new AuthorizationError("independent credential verification");
  if(!context.capabilities.has("profiles.credentials.verify")||!authorizedSubjectInScope) throw new AuthorizationError("verified credential review scope");
}

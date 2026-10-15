import { AuthorizationError, type CommandContext } from "./command-context";
export type ProfileField = "directory" | "education" | "credential" | "evidence" | "student";
export function assertProfileRead(context: CommandContext, targetPersonId: string, field: ProfileField): void {
  if (!context.actorPersonId) throw new AuthorizationError("authenticated profile access");
  if (field === "directory" && context.capabilities.has("profiles.directory.read")) return;
  if (context.actorPersonId === targetPersonId && field !== "evidence" && field !== "student") return;
  const capability = field === "evidence" ? "profiles.evidence.read" : field === "student" ? "student.read" : "profiles.read";
  if (!context.capabilities.has(capability)) throw new AuthorizationError(capability);
  // These capabilities alone are insufficient: caller must also establish a relationship
  // or an explicit nonempty scope. A resource-specific check is required at the service boundary.
  if (!(context.scope.organizationIds?.length || context.scope.siteIds?.length || context.scope.programIds?.length || context.scope.sectionIds?.length)) throw new AuthorizationError("profile resource scope");
}
export function assertCredentialVerification(context: CommandContext, subjectPersonId: string): void {
  if (!context.actorPersonId || context.actorPersonId === subjectPersonId) throw new AuthorizationError("independent credential verification");
  if (!context.capabilities.has("profiles.credentials.verify")) throw new AuthorizationError("profiles.credentials.verify");
  if (!(context.scope.organizationIds?.length || context.scope.siteIds?.length || context.scope.programIds?.length)) throw new AuthorizationError("credential review scope");
}

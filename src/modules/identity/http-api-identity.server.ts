import { getIdentityContext } from "./command-context.server";
import { normalizeClientError } from "@/lib/client-error";
import { readStudentClasses } from "@/modules/classes/native-class-student-home.server";

/** Transport-neutral adapter. No new tokens, grant selectors, or demo privileges. */
export async function resolveHttpIdentity(request: Request) {
  const actor = await getIdentityContext(request);
  if (!actor.actorPersonId) throw new Error("Authenticated Person missing");
  return {
    me: {
      personId: actor.actorPersonId,
      grantId: actor.grantId,
      role: actor.role,
      organizationIds: actor.scope.organizationIds ?? [],
      siteIds: actor.scope.siteIds ?? [],
      programIds: actor.scope.programIds ?? [],
    },
    readStudentClasses: () => readStudentClasses(actor),
  };
}
export function classifyHttpDomainError(error: unknown) {
  return normalizeClientError(error).kind;
}

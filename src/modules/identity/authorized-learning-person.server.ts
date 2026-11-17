import { AuthorizationError, assertCapability } from "@/domain/command-context";
import { getCanonicalCommandContext } from "./canonical-command-context.server";

/**
 * Authoritative current learner identity for native learning products.
 * Resolves CAN/native correspondence and reviewed-identity revocation in the
 * canonical command context before applying the requested learning capability.
 * Class/Course/Section eligibility remains owned by its own domain command.
 */
export async function resolveAuthorizedLearningPerson(
  request: Request,
  capability: "learning.participate" | "learning.progress" | "learning.survey.respond",
) {
  const actor=await getCanonicalCommandContext(request);
  if(actor.role!=="learner"||!actor.actorPersonId||
     actor.scope.organizationIds?.length!==1||
     actor.scope.siteIds?.length!==0)
    throw new AuthorizationError("current authorized canonical learner Person");
  assertCapability(actor,capability);
  return {actor,personId:actor.actorPersonId,request};
}

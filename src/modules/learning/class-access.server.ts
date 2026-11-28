import {AuthorizationError,assertCapability} from "@/domain/command-context";
import {requireActor} from "@/modules/identity/actors.server";
export {authorizeClass,accessibleClasses,type ClassTransaction} from "./class-access-core.server";

export async function classActor() {
  const actor = await requireActor(["student", "guardian", "teacher"]);
  assertCapability(actor, actor.role === "student" ? "student:read" : actor.role === "guardian" ? "student:related-read" : "teacher:read");
  if (!(actor.scope.siteIds?.length && actor.scope.programIds?.length) &&
      !(actor.role==="teacher" && actor.scope.sectionIds?.length))
    throw new AuthorizationError("class delivery scope");
  return actor;
}


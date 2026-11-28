import {getCommandContext} from "@/modules/identity/command-context.server";
import {AuthorizationError,assertCapability} from "@/domain/command-context";
import {rolesAllow} from "@/domain/school-roles";
import type {Actor} from "@/modules/identity/actors.server";
/** Existing registrar publisher role and capability, independent of transport. */
export async function requireCurriculumPublisher(request:Request):Promise<Actor>{
 const context=await getCommandContext(request);
 if(!context.actorPersonId||!rolesAllow(["registrar"],context.role))
  throw new AuthorizationError("publisher registrar role");
 assertCapability(context,"curriculum.publish");
 return context as Actor;
}

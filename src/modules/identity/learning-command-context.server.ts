import type {CommandContext} from "@/domain/command-context";
import {AuthorizationError} from "@/domain/command-context";
import {canLearningCookieMode} from "@/domain/can-learning-cookie-boundary";
import {getCanonicalCommandContext} from "./canonical-command-context.server";
import {getCommandContext} from "./command-context.server";

/** Resolve the active server-verified CAN Person, not a browser-selected identity.
 * Delegation for ordinary business commands remains subject to CAN role policy. */
async function getDirectCANLearningContext(request:Request){
  const actor=await getCommandContext(request);
  if(!actor.actorPersonId)throw new AuthorizationError("direct CAN Person learning session");
  return actor;
}

/** A second cookie can only be used in the transitional independently reviewed
 * adult native-learning path. An ordinary CAN student/staff identity must not
 * be paired with an unrelated native session identifier. */
async function getVerifiedNativeLearningContext(request:Request){
  const context=await getCanonicalCommandContext(request);
  if(context.role!=="learner"||!context.actorPersonId||!context.nativeLearningSessionId)
    throw new AuthorizationError("verified matching native learner session");
  return {context,sessionId:context.nativeLearningSessionId};
}

/** Instructional access starts with the one current CAN login. */
export async function getInstructionalLearnerContext(request:Request):Promise<CommandContext>{
  return canLearningCookieMode(request)==="can_with_native"
    ? (await getVerifiedNativeLearningContext(request)).context
    : getDirectCANLearningContext(request);
}

/** Persist evidence against the exact session validated by the identity resolver.
 * Native-only login is forbidden. Owner delegation may not create telemetry
 * attributed as the actual learner's own time-on-task. */
export async function getInstructionalLearnerSession(request:Request):Promise<{context:CommandContext;sessionId:string}>{
  if(canLearningCookieMode(request)==="can_with_native")
    return getVerifiedNativeLearningContext(request);
  const actor=await getDirectCANLearningContext(request);
  if(actor.sessionAccountId||actor.impersonatedByAccountId||actor.delegatedByPlatformOwner||actor.delegationMode)
    throw new AuthorizationError("direct learner activity session");
  if(!actor.sessionId)throw new AuthorizationError("authenticated session");
  return {context:actor,sessionId:actor.sessionId};
}

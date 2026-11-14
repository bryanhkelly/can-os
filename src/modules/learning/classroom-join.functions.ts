import { z } from "zod";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { AuthorizationError } from "@/domain/command-context";
import { getCommandContext } from "@/modules/identity/command-context.server";
import {
  CLASSROOM_FACILITATOR_ROLES,
  classroomPresentationForActor,
  endClassroomSessionForActor,
  joinClassroomSessionForActor,
  openClassroomSessionForActor,
  rotateClassroomJoinCodeForActor,
} from "./classroom-join.server";

const uuid = z.string().uuid();

async function requireClassroomActor() {
  const context = await getCommandContext(getRequest());
  if (!context.actorPersonId) throw new AuthorizationError("authenticated person");
  return context as import("@/modules/identity/actors.server").Actor;
}

function requireFacilitatorRole(
  actor: { role: string },
): asserts actor is import("@/modules/identity/actors.server").Actor {
  if (!CLASSROOM_FACILITATOR_ROLES.includes(actor.role as (typeof CLASSROOM_FACILITATOR_ROLES)[number])) {
    throw new AuthorizationError(`role: ${CLASSROOM_FACILITATOR_ROLES.join(" or ")}`);
  }
}

/** Open a live classroom session and issue its first join code. */
export const openClassroomSession = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    title: z.string().trim().min(2).max(150),
    siteId: uuid.nullish(),
  }).parse(value))
  .handler(async ({ data }) => {
    const actor = await requireClassroomActor();
    requireFacilitatorRole(actor);
    return openClassroomSessionForActor(actor, data);
  });

/** Rotate the join code shown to the room (previous code retires immediately). */
export const rotateClassroomJoinCode = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ sessionId: uuid }).parse(value))
  .handler(async ({ data }) => {
    const actor = await requireClassroomActor();
    requireFacilitatorRole(actor);
    return rotateClassroomJoinCodeForActor(actor, data.sessionId);
  });

/** End an open session; codes are revoked and joining closes. */
export const endClassroomSession = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ sessionId: uuid }).parse(value))
  .handler(async ({ data }) => {
    const actor = await requireClassroomActor();
    requireFacilitatorRole(actor);
    return endClassroomSessionForActor(actor, data.sessionId);
  });

/** Facilitator presentation payload: title, active code and aggregate count only. */
export const getClassroomPresentation = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({ sessionId: uuid }).parse(value))
  .handler(async ({ data }) => {
    const actor = await requireClassroomActor();
    requireFacilitatorRole(actor);
    return classroomPresentationForActor(actor, data.sessionId);
  });

/**
 * Learner join by class code. Any verified, enrolled learner may join;
 * joining is audited and creates no gradebook or attendance claims.
 */
export const joinClassroomSession = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    code: z.string().trim().min(1).max(24),
    deviceKey: z.string().trim().min(8).max(128),
    idempotencyKey: z.string().trim().min(8).max(128),
  }).parse(value))
  .handler(async ({ data }) => {
    const actor = await requireClassroomActor();
    return joinClassroomSessionForActor(actor, data);
  });

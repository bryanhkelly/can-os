import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { facilitatedRoomControlCommands } from "@/db/canonical-v301";
import { AuthorizationError } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";
import { facilitatedRoomOperationalState } from "@/domain/facilitated-learning";
import { requireCanonicalFacilitator } from "./canonical-facilitator-access.server";
import {
  ownedRoom, assertAuthorizedFacilitatedRoomMedia,
} from "./facilitated-learning.functions";
import { requireFacilitatedLearningEnabled } from "./canonical-learning-release.server";

const uuid = z.string().uuid();
const roomInput = z.object({ facilitatedSessionId: uuid }).strict();
const commandInput = roomInput.extend({
  requestId: uuid, lessonId: uuid, assetVersionId: uuid,
  commandKind: z.enum(["load", "play", "pause", "seek", "stop"]),
  positionSeconds: z.number().int().min(0).max(43200),
}).strict();

function guard() {
  // This is a restricted-auth configuration requirement, NOT a rollout flag.
  requireFacilitatedLearningEnabled();
  setResponseHeader("Cache-Control", "private, no-store");
  setResponseHeader("Referrer-Policy", "no-referrer");
}

/** This channel contains playback INTENT. The video player's independently
 * recorded observations must never be counted as actual learner watch time.
 */
export const getClassroomProjectorCommand = createServerFn({ method: "GET" })
  .validator((v: unknown) => roomInput.parse(v))
  .handler(async ({ data }) => {
    guard();
    const host = await requireCanonicalFacilitator();
    return db.transaction(async tx => {
      const room = await ownedRoom(tx, host, data.facilitatedSessionId);
      const state = facilitatedRoomOperationalState(room, new Date());
      if (state !== "live") {
        return { roomState: state as "ended" | "expired" | "blocked", latest: null,
          note: "The classroom cannot play media after its time limit or closure." };
      }
      const [command] = await tx.select().from(facilitatedRoomControlCommands)
        .where(eq(facilitatedRoomControlCommands.facilitatedSessionId, room.id))
        .orderBy(desc(facilitatedRoomControlCommands.issuedAt),
          desc(facilitatedRoomControlCommands.id)).limit(1);
      // Rights or Site placement may be revoked *after* a command was issued.
      // Deny/stop on the very next projector poll, not just on the next URL.
      if (command) {
        try {
          await assertAuthorizedFacilitatedRoomMedia(
            tx, room, command.lessonId, command.assetVersionId,
          );
        } catch (error) {
          if (!(error instanceof AuthorizationError) && !(error instanceof DomainError))
            throw error;
          return { roomState: "blocked" as const, latest: null,
            note: "Current audience or recording authorization must be restored." };
        }
      }
      return {
        roomState: "live" as const,
        latest: command ? {
          id: command.id, lessonId: command.lessonId, assetVersionId: command.assetVersionId,
          commandKind: command.commandKind, positionSeconds: command.positionSeconds,
          issuedAt: command.issuedAt.toISOString(),
        } : null,
        note: "Projector control requests do not establish learner watch time or attendance.",
      };
    });
  });

export const issueClassroomProjectorCommand = createServerFn({ method: "POST" })
  .validator((v: unknown) => commandInput.parse(v))
  .handler(async ({ data }) => {
    guard();
    const host = await requireCanonicalFacilitator();
    return db.transaction(async tx => {
      const room = await ownedRoom(tx, host, data.facilitatedSessionId, true);
      // Every remote command, including seek and stop, is tied to the real
      // paired Site audience and each distinct current Course adoption.
      await assertAuthorizedFacilitatedRoomMedia(
        tx, room, data.lessonId, data.assetVersionId,
      );
      const [saved] = await tx.insert(facilitatedRoomControlCommands).values({
        facilitatedSessionId: room.id, facilitatorPersonId: host.actor.actorPersonId!,
        requestId: data.requestId, lessonId: data.lessonId,
        assetVersionId: data.assetVersionId, commandKind: data.commandKind,
        positionSeconds: data.positionSeconds,
      }).onConflictDoNothing().returning({ id: facilitatedRoomControlCommands.id });
      if (!saved) {
        const [existing] = await tx.select().from(facilitatedRoomControlCommands)
          .where(and(
            eq(facilitatedRoomControlCommands.facilitatedSessionId, room.id),
            eq(facilitatedRoomControlCommands.requestId, data.requestId),
          )).limit(1);
        if (!existing || existing.facilitatorPersonId !== host.actor.actorPersonId ||
            existing.lessonId !== data.lessonId || existing.assetVersionId !== data.assetVersionId ||
            existing.commandKind !== data.commandKind ||
            existing.positionSeconds !== data.positionSeconds)
          throw new Error("Conflicting projector command retry");
      }
      return { accepted: true, duplicate: !saved,
        note: "Projector command accepted. The projector may require local playback activation." };
    });
  });

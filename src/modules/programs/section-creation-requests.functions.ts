import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { AuthorizationError } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { actions, programs } from "@/db/schema";
import { db } from "@/db/client";
import { recordAudit, requireActor } from "@/modules/identity/actors.server";
import { emitEvent } from "@/platform/mutation";

const uuid = z.string().uuid();
const requestInput = z.object({
  requestId: uuid,
  programId: uuid,
  requestedClassTitle: z.string().trim().min(2).max(160),
  requestedCourseOrSubject: z.string().trim().min(2).max(120),
  desiredTerm: z.string().trim().min(2).max(100),
  schedulePreference: z.string().trim().max(500).default(""),
  notes: z.string().trim().max(1000).default(""),
});

function requestDetails(metadata: Record<string, unknown>) {
  const requestedClassTitle = metadata.requestedClassTitle;
  const requestedCourseOrSubject = metadata.requestedCourseOrSubject;
  const desiredTerm = metadata.desiredTerm;
  if (typeof requestedClassTitle !== "string" ||
      typeof requestedCourseOrSubject !== "string" ||
      typeof desiredTerm !== "string") {
    throw new Error("Class request is missing its required details");
  }
  const optionalText = (key: string) => {
    const value = metadata[key];
    if (value !== undefined && typeof value !== "string") {
      throw new Error(`Class request has invalid ${key}`);
    }
    return typeof value === "string" ? value : "";
  };
  return {
    requestedClassTitle,
    requestedCourseOrSubject,
    desiredTerm,
    schedulePreference: optionalText("schedulePreference"),
    notes: optionalText("notes"),
  };
}

export const getTeacherClassRequestOptions = createServerFn({ method: "GET" }).handler(async () => {
  const actor = await requireActor(["teacher"], "class.request");
  setResponseHeader("Cache-Control", "private, no-store");
  const programIds = actor.scope.programIds ?? [];
  const siteIds = actor.scope.siteIds ?? [];
  const organizationIds = actor.scope.organizationIds ?? [];
  if (!programIds.length || !siteIds.length || !organizationIds.length) {
    return { programs: [], requests: [] };
  }

  const programRows = await db.select({
    id: programs.id,
    name: programs.name,
  }).from(programs).where(and(
    inArray(programs.id, programIds),
    inArray(programs.siteId, siteIds),
    inArray(programs.organizationId, organizationIds),
    inArray(programs.status, ["draft", "launching", "ready", "active"]),
  )).orderBy(programs.name);
  const programNames = new Map(programRows.map(program => [program.id, program.name]));
  const requestRows = programRows.length ? await db.select({
    id: actions.id,
    programId: actions.programId,
    status: actions.status,
    metadata: actions.metadata,
    resolutionNote: actions.resolutionNote,
    createdAt: actions.createdAt,
  }).from(actions).where(and(
    eq(actions.type, "section_creation_request"),
    eq(actions.ownerPersonId, actor.actorPersonId),
    inArray(actions.programId, programRows.map(program => program.id)),
    inArray(actions.siteId, siteIds),
    inArray(actions.organizationId, organizationIds),
    inArray(actions.status, ["open", "resolved", "cancelled"]),
  )).orderBy(desc(actions.createdAt)).limit(50) : [];

  return {
    programs: programRows,
    requests: requestRows.map(request => ({
      id: request.id,
      programId: request.programId!,
      programName: programNames.get(request.programId!) ?? "School program",
      status: request.status,
      ...requestDetails(request.metadata),
      resolutionNote: request.resolutionNote,
      sectionId: typeof request.metadata.provisionedSectionId === "string"
        ? request.metadata.provisionedSectionId
        : null,
      createdAt: request.createdAt.toISOString(),
    })),
  };
});

export const submitTeacherClassRequest = createServerFn({ method: "POST" })
  .validator((value: unknown) => requestInput.parse(value))
  .handler(async ({ data }) => {
    const actor = await requireActor(["teacher"], "class.request");
    const programIds = actor.scope.programIds ?? [];
    const siteIds = actor.scope.siteIds ?? [];
    const organizationIds = actor.scope.organizationIds ?? [];
    if (!programIds.includes(data.programId) || !siteIds.length || !organizationIds.length) {
      throw new AuthorizationError("teacher class request program, site and organization scope");
    }

    const metadata = {
      requestedClassTitle: data.requestedClassTitle,
      requestedCourseOrSubject: data.requestedCourseOrSubject,
      desiredTerm: data.desiredTerm,
      schedulePreference: data.schedulePreference,
      notes: data.notes,
      requestOrigin: "teacher_classes",
    };
    return db.transaction(async tx => {
      const [program] = await tx.select({
        id: programs.id,
        name: programs.name,
        siteId: programs.siteId,
        organizationId: programs.organizationId,
      }).from(programs).where(and(
        eq(programs.id, data.programId),
        inArray(programs.id, programIds),
        inArray(programs.siteId, siteIds),
        inArray(programs.organizationId, organizationIds),
        inArray(programs.status, ["draft", "launching", "ready", "active"]),
      )).limit(1);
      if (!program?.siteId) throw new AuthorizationError("active school program scope");

      const [created] = await tx.insert(actions).values({
        id: data.requestId,
        type: "section_creation_request",
        status: "open",
        priority: "normal",
        title: `Class setup request: ${data.requestedClassTitle}`,
        description: data.notes || "A teacher requested setup for a new class.",
        ownerPersonId: actor.actorPersonId,
        organizationId: program.organizationId,
        siteId: program.siteId,
        programId: program.id,
        subjectType: "program",
        subjectId: program.id,
        metadata,
      }).onConflictDoNothing().returning({ id: actions.id });

      if (!created) {
        const [existing] = await tx.select().from(actions)
          .where(eq(actions.id, data.requestId)).for("update").limit(1);
        if (!existing || existing.type !== "section_creation_request" ||
            existing.ownerPersonId !== actor.actorPersonId ||
            existing.programId !== program.id ||
            existing.subjectType !== "program" ||
            existing.subjectId !== program.id ||
            JSON.stringify(requestDetails(existing.metadata)) !==
              JSON.stringify(requestDetails(metadata))) {
          throw new Error("Request identifier was already used for a different command");
        }
        return { requestId: existing.id, replayed: true };
      }

      await recordAudit(tx, actor, {
        action: "section_creation.request",
        resourceType: "action",
        resourceId: created.id,
        scope: {
          organizationId: program.organizationId,
          siteId: program.siteId,
          programId: program.id,
        },
        after: metadata,
      });
      await emitEvent(tx, {
        eventType: EventTypes.SectionCreationRequested,
        aggregateType: "action",
        aggregateId: created.id,
        actorPersonId: actor.actorPersonId,
        payload: { programId: program.id, siteId: program.siteId },
      });
      return { requestId: created.id, replayed: false };
    });
  });

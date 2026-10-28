import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { accessAccounts, accountPersonGrants, actions, people, programs } from "@/db/schema";
import { assertCapability, AuthorizationError, type CommandContext } from "@/domain/command-context";
import { emitEvent, notify, writeAudit } from "@/platform/mutation";
import type { Actor } from "@/modules/identity/actors.server";
import { hasInstitutionalProgramCapability } from "@/modules/identity/institutional-capability.server";

import { EventTypes } from "@/domain/event-types";
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Reader = Pick<typeof db, "select">;
type ProgramScope = { id: string; organizationId: string; siteId: string | null };
export const openingHandoffType = "program_opening_handoff";
export const openingHandoffManagerCapability = "program.opening.handoff.manage";
const recoverySchema=z.object({
  revision:z.number().int().nonnegative().default(0),
  lastTransfer:z.object({requestId:z.string().uuid(),previousOwnerPersonId:z.string().uuid(),
    recipientPersonId:z.string().uuid(),reason:z.string(),transferredAt:z.string().datetime()}).optional(),
});

export async function listOpeningOperators(program: Pick<ProgramScope,"organizationId"|"siteId">, executor: Reader = db) {
  if (!program.siteId) return [];
  const rows = await executor.select({ personId: people.id,
    firstName: people.legalFirstName, lastName: people.legalLastName,
  }).from(accountPersonGrants)
    .innerJoin(people, eq(people.id, accountPersonGrants.personId))
    .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
    .where(and(eq(accountPersonGrants.organizationId, program.organizationId),
      eq(accountPersonGrants.siteId, program.siteId), eq(accountPersonGrants.role, "registrar"),
      eq(accountPersonGrants.active, true), eq(people.active, true), eq(accessAccounts.disabled, false)))
    .orderBy(asc(people.legalLastName), asc(people.legalFirstName));
  return [...new Map(rows.map(row => [row.personId, row])).values()];
}

export async function assertOpeningOperator(program: ProgramScope, personId: string, executor: Reader = db) {
  if (!(await listOpeningOperators(program, executor)).some(operator => operator.personId === personId)) {
    throw new AuthorizationError("handoff recipient must be an active registrar/operator at this site");
  }
}

export async function createOpeningHandoff(tx: Transaction, context: CommandContext, input: {
  program: ProgramScope & { name: string }; recipientPersonId: string; journeyId: string;
  openedAt: Date; sectionIds: string[];
}) {
  const { program } = input;
  const [created] = await tx.insert(actions).values({
    type: openingHandoffType, title: program.name + " - opening handoff",
    description: input.sectionIds.length
      ? "Review the opening record, school-year setup, classes and daily operations, then acknowledge receipt. This acknowledgment is not regulatory approval."
      : "Review the opening record, program schedule, onsite facilitators and daily operations, then acknowledge receipt. This acknowledgment is not regulatory approval.",
    organizationId: program.organizationId, siteId: program.siteId, programId: program.id,
    subjectType: "program", subjectId: program.id, ownerPersonId: input.recipientPersonId,
    priority: "high",
    metadata: { version: 1, journeyId: input.journeyId, openedAt: input.openedAt.toISOString(),
      openedByPersonId: context.actorPersonId, sectionIds: input.sectionIds },
  }).returning({ id: actions.id });
  if (!created) throw new Error("Failed to create opening handoff");
  const scope = { organizationId: program.organizationId, siteId: program.siteId, programId: program.id };
  await writeAudit(tx, context, {
    action: "program.opening.handoff.create", entityType: "action", entityId: created.id, scope,
    after: { recipientPersonId: input.recipientPersonId, journeyId: input.journeyId,
      openedAt: input.openedAt.toISOString(), sectionIds: input.sectionIds },
  });
  await emitEvent(tx, {
    eventType: EventTypes.ProgramOpeningHandoffCreated, aggregateType: "action", aggregateId: created.id,
    actorPersonId: context.actorPersonId, ...scope,
    payload: { recipientPersonId: input.recipientPersonId, journeyId: input.journeyId },
  });
  await emitEvent(tx, {
    eventType: EventTypes.ActionCreated, aggregateType: "action", aggregateId: created.id,
    actorPersonId: context.actorPersonId, ...scope,
    payload: { subjectType: "program", subjectId: program.id, source: openingHandoffType },
  });
  await notify(tx, {
    recipientPersonId: input.recipientPersonId, type: openingHandoffType,
    title: program.name + " is open - review the handoff",
    body: "You are the named receiving operator. Review the opening handoff in Site Today and acknowledge receipt.",
    resourceType: "action", resourceId: created.id,
  });
  return created.id;
}

export async function listOpeningHandoffs(programIds: string[], executor: Reader = db) {
  if (!programIds.length) return [];
  const rows=await executor.select({
    id: actions.id, programId: actions.programId, siteId: actions.siteId,
    title: actions.title, status: actions.status, ownerPersonId: actions.ownerPersonId,
    firstName: people.legalFirstName, lastName: people.legalLastName,
    createdAt: actions.createdAt, resolvedAt: actions.resolvedAt, resolutionNote: actions.resolutionNote,
    metadata:actions.metadata,
  }).from(actions).leftJoin(people, eq(people.id, actions.ownerPersonId))
    .where(and(eq(actions.type, openingHandoffType), inArray(actions.programId, programIds)))
    .orderBy(asc(actions.createdAt));
  return rows.map(({metadata,...row})=>{
    const snapshot=z.object({version:z.literal(1),openedAt:z.string().datetime(),
      journeyId:z.string().uuid(),sectionIds:z.array(z.string().uuid())}).parse(metadata);
    const recovery=recoverySchema.parse(metadata);
    return {...row,openedAt:snapshot.openedAt,sectionCountAtOpening:snapshot.sectionIds.length,
      revision:recovery.revision,lastTransfer:recovery.lastTransfer??null};
  });
}

export async function transferOpeningHandoff(actor: Actor, input: {
  actionId:string; expectedRevision:number; requestId:string; recipientPersonId:string; reason:string;
}) {
  return db.transaction(async tx=>{
    const [action]=await tx.select().from(actions).where(eq(actions.id,input.actionId)).for("update").limit(1);
    const [program]=action?.programId?await tx.select().from(programs)
      .where(eq(programs.id,action.programId)).limit(1):[];
    if(!action||action.type!==openingHandoffType||!program||
      !await hasInstitutionalProgramCapability(actor,program,openingHandoffManagerCapability,tx))
      throw new AuthorizationError("explicit opening handoff manager and scope");
    if(program.status!=="active"||program.siteId!==action.siteId||program.organizationId!==action.organizationId||
      action.subjectType!=="program"||action.subjectId!==program.id)
      throw new Error("Opening handoff does not match an active program");
    if(action.status!=="open")throw new Error("Only pending opening handoffs may be transferred");
    const recovery=recoverySchema.parse(action.metadata);
    const last=recovery.lastTransfer;
    if(last?.requestId===input.requestId){
      if(recovery.revision===input.expectedRevision+1&&last.recipientPersonId===input.recipientPersonId&&
        last.reason===input.reason&&action.ownerPersonId===input.recipientPersonId)
        return {actionId:action.id,revision:recovery.revision};
      throw new Error("Transfer request already used with different details");
    }
    if(recovery.revision!==input.expectedRevision)throw new Error("Handoff changed. Refresh before transferring.");
    const operators=await listOpeningOperators(program,tx);
    if(operators.some(operator=>operator.personId===action.ownerPersonId))
      throw new Error("The current recipient is still eligible; recovery transfer is not permitted");
    if(!operators.some(operator=>operator.personId===input.recipientPersonId))
      throw new AuthorizationError("replacement must be an active registrar/operator at this site");
    if(!action.ownerPersonId)throw new Error("Opening handoff has no recorded recipient");
    const transferredAt=new Date().toISOString();
    const lastTransfer={requestId:input.requestId,previousOwnerPersonId:action.ownerPersonId,
      recipientPersonId:input.recipientPersonId,reason:input.reason,transferredAt};
    const revision=recovery.revision+1;
    await tx.update(actions).set({ownerPersonId:input.recipientPersonId,updatedAt:new Date(),
      metadata:{...action.metadata,revision,lastTransfer}}).where(eq(actions.id,action.id));
    const scope={organizationId:program.organizationId,siteId:program.siteId,programId:program.id};
    await writeAudit(tx,actor,{action:"program.opening.handoff.transfer",entityType:"action",entityId:action.id,
      scope,before:{ownerPersonId:action.ownerPersonId,revision:recovery.revision},
      after:{ownerPersonId:input.recipientPersonId,revision,...lastTransfer,confirmed:true}});
    await emitEvent(tx,{eventType:EventTypes.ProgramOpeningHandoffTransferred,aggregateType:"action",aggregateId:action.id,
      actorPersonId:actor.actorPersonId,...scope,payload:{...lastTransfer,revision}});
    await notify(tx,{recipientPersonId:input.recipientPersonId,type:openingHandoffType,
      title:program.name+" - opening handoff transferred to you",
      body:"The previous recipient is no longer eligible. Review the opening record in Site Today and acknowledge receipt.",
      resourceType:"action",resourceId:action.id});
    return {actionId:action.id,revision};
  });
}

export async function acknowledgeOpeningHandoff(context: CommandContext, input: {
  actionId: string; note: string;
}) {
  assertCapability(context, "action.resolve");
  const note = input.note.trim();
  if (note.length < 10 || note.length > 2000) throw new Error("Enter an acknowledgment note of 10 to 2000 characters");
  return db.transaction(async tx => {
    const [action] = await tx.select().from(actions).where(eq(actions.id, input.actionId)).for("update").limit(1);
    if (!action || action.type !== openingHandoffType || action.ownerPersonId !== context.actorPersonId ||
      !action.organizationId || !action.siteId || !action.programId ||
      !context.scope.organizationIds?.includes(action.organizationId) ||
      !context.scope.siteIds?.includes(action.siteId) || !context.scope.programIds?.includes(action.programId)) {
      throw new AuthorizationError("named opening handoff recipient and scope");
    }
    const [program] = await tx.select().from(programs).where(eq(programs.id, action.programId)).limit(1);
    if (!program || program.status !== "active" || program.siteId !== action.siteId ||
      program.organizationId !== action.organizationId || action.subjectType !== "program" ||
      action.subjectId !== program.id) throw new Error("Opening handoff does not match an active program");
    await assertOpeningOperator(program, action.ownerPersonId!, tx);
    if (action.status === "resolved") {
      if (action.resolutionNote !== note) throw new Error("Handoff already acknowledged with a different note. Refresh to view it.");
      return { actionId: action.id, acknowledged: true as const };
    }
    if (action.status !== "open") throw new Error("Opening handoff is not awaiting acknowledgment");
    const now = new Date();
    await tx.update(actions).set({ status: "resolved", resolvedAt: now, resolutionNote: note, updatedAt: now })
      .where(eq(actions.id, action.id));
    const scope = { organizationId: action.organizationId, siteId: action.siteId, programId: action.programId };
    await writeAudit(tx, context, {
      action: "program.opening.handoff.acknowledge", entityType: "action", entityId: action.id, scope,
      before: { status: action.status }, after: { status: "resolved", resolutionNote: note, acknowledgedAt: now.toISOString() },
    });
    await emitEvent(tx, {
      eventType: EventTypes.ProgramOpeningHandoffAcknowledged, aggregateType: "action", aggregateId: action.id,
      actorPersonId: context.actorPersonId, ...scope, payload: { acknowledgedAt: now.toISOString() },
    });
    await emitEvent(tx, {
      eventType: EventTypes.ActionResolved, aggregateType: "action", aggregateId: action.id,
      actorPersonId: context.actorPersonId, ...scope, payload: { subjectType: "program", subjectId: program.id },
    });
    return { actionId: action.id, acknowledged: true as const };
  });
}

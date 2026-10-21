import { and, eq } from "drizzle-orm";
import { z } from "zod";
import type { Database } from "@/db/client";
import { journeyDefinitions, journeyRequirements, journeys } from "@/db/schema";
import { applicationPacketProgress, packetSections, type ApplicationPacket } from "@/domain/application-packet";
import type { CommandContext } from "@/domain/command-context";
import { EventTypes } from "@/domain/event-types";
import { emitEvent, writeAudit } from "@/platform/mutation";
import { instantiateJourneyFromDefinition } from "@/modules/journeys/instantiate";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];
const definitionKey = "admissions-core-packet-v1";
export async function syncApplicationPacketJourney(tx: Transaction, actor: CommandContext, input: {
  applicationId: string; organizationId: string; siteId: string; programId: string;
  packet: ApplicationPacket; statement: string; revision: number;
}) {
  const configuration = { requirements: packetSections.map(section => ({
    key: section.key, title: section.title, blocking: true, owner: "family",
  })) };
  await tx.insert(journeyDefinitions).values({
    key: definitionKey, version: "1", audience: "applicant", title: "Core admissions application",
    configuration,
  }).onConflictDoNothing();
  const [definition] = await tx.select().from(journeyDefinitions).where(and(
    eq(journeyDefinitions.key, definitionKey), eq(journeyDefinitions.version, "1"),
  ));
  const configSchema = z.object({ requirements: z.array(z.object({
    key: z.string(), title: z.string(), blocking: z.boolean(), owner: z.string(),
  }).strict()) }).strict();
  if (!definition?.active || definition.owningOrganizationId !== null ||
    JSON.stringify(configSchema.parse(definition.configuration)) !== JSON.stringify(configuration))
    throw new Error("Core application Journey definition does not match its published version");
  let [journey] = await tx.select().from(journeys).where(and(
    eq(journeys.participantType, "admissions_application"), eq(journeys.participantId, input.applicationId),
    eq(journeys.type, definitionKey),
  )).for("update");
  if (!journey) {
    const created = await instantiateJourneyFromDefinition(tx, {
      definitionKey, subjectType: "admissions_application", subjectId: input.applicationId,
      organizationId: input.organizationId, siteId: input.siteId, programId: input.programId,
      ownerPersonId: actor.actorPersonId,
    });
    [journey] = await tx.select().from(journeys).where(eq(journeys.id, created.journeyId));
  }
  if (!journey) throw new Error("Application Journey unavailable");
  const progress = applicationPacketProgress(input.packet, input.statement);
  const requirements = await tx.select().from(journeyRequirements).where(eq(journeyRequirements.journeyId, journey.id));
  if (requirements.length !== packetSections.length) throw new Error("Application Journey requirements are incomplete");
  for (const section of packetSections) {
    const requirement = requirements.find(row => row.key === section.key);
    if (!requirement) throw new Error("Application Journey section unavailable");
    const status = progress[section.key].length ? "needs_you" : "complete";
    await tx.update(journeyRequirements).set({
      status, completedAt: status === "complete" ? requirement.completedAt ?? new Date() : null,
      evidence: [{ kind: "application_packet_revision", revision: input.revision }],
      metadata: { applicationPacketSection: section.key }, updatedAt: new Date(),
    }).where(eq(journeyRequirements.id, requirement.id));
    if (status !== requirement.status) await emitEvent(tx, {
      eventType: EventTypes.JourneyRequirementStatusChanged, aggregateType: "journey_requirement",
      aggregateId: requirement.id, actorPersonId: actor.actorPersonId,
      organizationId: input.organizationId, programId: input.programId,
      payload: { journeyId: journey.id, status, revision: input.revision },
    });
  }
  const status = Object.values(progress).every(items => !items.length) ? "ready" : "in_progress";
  await tx.update(journeys).set({ status, updatedAt: new Date() }).where(eq(journeys.id, journey.id));
  if (status === "ready" && journey.status !== "ready") await emitEvent(tx, {
    eventType: EventTypes.JourneyReady, aggregateType: "journey", aggregateId: journey.id,
    actorPersonId: actor.actorPersonId, organizationId: input.organizationId, programId: input.programId,
    payload: { applicationId: input.applicationId, revision: input.revision },
  });
  await writeAudit(tx, actor, { action: "admissions.application.packet_progress", entityType: "journey",
    entityId: journey.id, scope: { organizationId: input.organizationId, programId: input.programId },
    before: { status: journey.status },
    after: { status, revision: input.revision } });
}

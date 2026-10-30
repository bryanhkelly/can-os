import { and, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import {
  auditEvents, complianceFrameworks, complianceFrameworkVersions, compliancePolicyApplicability,
  compliancePolicyRules, programs, qualificationDefinitions,
} from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { lockAttendanceConfigurationAtSite } from "@/domain/attendance-configuration-lock";
import { recordAudit, type Actor } from "@/modules/identity/actors.server";
import { hasInstitutionalProgramCapability } from "@/modules/identity/institutional-capability.server";
import { emitEvent } from "@/platform/mutation";

import { EventTypes } from "@/domain/event-types";
export const teacherPolicyPublisherCapability = "staffing.policy.publish";
const expressionSchema = z.object({
  op: z.literal("all"),
  rules: z.array(z.object({ op: z.literal("credential"), type: z.string().min(1) }).strict()).min(1),
}).strict();

export async function listLaunchTeacherPolicies(programId: string, executor: Pick<typeof db, "select"> = db) {
  const versions = await executor.select({
    id: complianceFrameworkVersions.id, version: complianceFrameworkVersions.version,
    status: complianceFrameworkVersions.status, effectiveFrom: complianceFrameworkVersions.effectiveFrom,
    effectiveThrough: complianceFrameworkVersions.effectiveThrough,
  }).from(complianceFrameworks)
    .innerJoin(complianceFrameworkVersions, eq(complianceFrameworkVersions.frameworkId, complianceFrameworks.id))
    .where(eq(complianceFrameworks.key, "launch-teacher:" + programId));
  const rules = versions.length ? await executor.select().from(compliancePolicyRules)
    .where(inArray(compliancePolicyRules.frameworkVersionId, versions.map(version => version.id))) : [];
  return versions.map(version => {
    const versionRules = rules.filter(rule => rule.frameworkVersionId === version.id);
    const parsed = versionRules.length === 1 && versionRules[0]?.code === "teacher-qualifications" &&
      Object.keys(versionRules[0].evidencePolicy).length === 0
      ? expressionSchema.safeParse(versionRules[0].expression) : null;
    return { ...version,
      effectiveFrom: version.effectiveFrom?.toISOString() ?? null,
      effectiveThrough: version.effectiveThrough?.toISOString() ?? null,
      qualificationKeys: parsed?.success ? [...new Set(parsed.data.rules.map(rule => rule.type))].sort() : null,
    };
  }).sort((a, b) => Number(a.version) - Number(b.version));
}

export async function reviseLaunchTeacherRequirements(actor: Actor, input: {
  programId: string; expectedVersionId: string; qualificationKeys: string[];
  effectiveFrom: string; reason: string;
}) {
  return db.transaction(async tx => {
    const [program] = await tx.select().from(programs).where(eq(programs.id, input.programId)).limit(1);
    if (!program || !await hasInstitutionalProgramCapability(actor, program, teacherPolicyPublisherCapability, tx)) {
      throw new AuthorizationError("explicit staffing policy publisher");
    }
    await lockAttendanceConfigurationAtSite(tx, program.siteId!);
    const [current] = await tx.select().from(programs).where(eq(programs.id, program.id)).for("update").limit(1);
    if (!current || !await hasInstitutionalProgramCapability(actor, current, teacherPolicyPublisherCapability, tx)) {
      throw new AuthorizationError("explicit staffing policy publisher");
    }
    if (!["draft", "launching", "ready"].includes(current.status)) {
      throw new Error("Teacher policy revisions are limited to pre-opening programs");
    }
    const policies = await listLaunchTeacherPolicies(program.id, tx);
    if (!policies.length || policies.some((policy, index) => policy.status !== "published" ||
      !policy.qualificationKeys || policy.version !== String(index + 1) ||
      (index > 0 && (!policy.effectiveFrom || policy.effectiveFrom !== policies[index - 1]?.effectiveThrough)))) {
      throw new Error("This policy requires a separately reviewed migration before revision");
    }
    const previous = policies.find(policy => policy.id === input.expectedVersionId);
    if (!previous) throw new Error("Policy changed. Refresh before publishing a revision.");
    const keys = [...new Set(input.qualificationKeys)].sort();
    const effectiveFrom = new Date(input.effectiveFrom);
    // Match a committed successor before checking time so a lost response can be retried safely.
    const successor = policies.find(policy => Number(policy.version) === Number(previous.version) + 1);
    if (successor && successor.effectiveFrom === effectiveFrom.toISOString() &&
      JSON.stringify(successor.qualificationKeys) === JSON.stringify(keys) &&
      previous.effectiveThrough === successor.effectiveFrom) {
      const [audit] = await tx.select({ after: auditEvents.after }).from(auditEvents)
        .where(and(eq(auditEvents.resourceId, successor.id), eq(auditEvents.action, "launch.teacher_policy.revise"))).limit(1);
      if (audit?.after?.reason === input.reason) return { versionId: successor.id, created: false };
      throw new Error("Policy changed. Refresh before publishing a revision.");
    }
    if (policies.at(-1)?.id !== previous.id || previous.effectiveThrough) {
      throw new Error("Policy changed. Refresh before publishing a revision.");
    }
    if (effectiveFrom.getTime() <= Date.now() ||
      (previous.effectiveFrom && effectiveFrom <= new Date(previous.effectiveFrom))) {
      throw new Error("Choose a future effective instant after the latest policy's start");
    }
    const definitions = await tx.select({ key: qualificationDefinitions.key }).from(qualificationDefinitions)
      .where(inArray(qualificationDefinitions.key, keys));
    if (definitions.length !== keys.length) throw new Error("Choose existing qualification catalog entries");
    const [parent] = await tx.select().from(complianceFrameworkVersions)
      .where(eq(complianceFrameworkVersions.id, previous.id)).limit(1);
    if (!parent) throw new Error("Previous teacher policy not found");
    const applicability = await tx.select().from(compliancePolicyApplicability)
      .where(eq(compliancePolicyApplicability.frameworkVersionId, parent.id));
    if (applicability.length !== 1 || !applicability[0] ||
      applicability[0].organizationId !== current.organizationId ||
      applicability[0].siteId !== current.siteId || applicability[0].programId !== current.id ||
      applicability[0].jurisdictionId !== null || applicability[0].roleKey !== "teacher" ||
      applicability[0].effectiveFrom || applicability[0].effectiveThrough) {
      throw new Error("This policy scope requires a separately reviewed migration before revision");
    }
    const nextVersion = String(Number(previous.version) + 1);
    const [created] = await tx.insert(complianceFrameworkVersions).values({
      frameworkId: parent.frameworkId, version: nextVersion, status: "published", effectiveFrom,
    }).returning({ id: complianceFrameworkVersions.id });
    if (!created) throw new Error("Failed to publish teacher policy revision");
    await tx.insert(compliancePolicyRules).values({
      frameworkVersionId: created.id, code: "teacher-qualifications",
      description: "All listed qualifications must be independently verified throughout instruction.",
      expression: { op: "all", rules: keys.map(type => ({ op: "credential", type })) },
    });
    await tx.insert(compliancePolicyApplicability).values({
      frameworkVersionId: created.id, organizationId: current.organizationId,
      siteId: current.siteId, programId: current.id, roleKey: "teacher",
    });
    await tx.update(complianceFrameworkVersions).set({ effectiveThrough: effectiveFrom, updatedAt: new Date() })
      .where(and(eq(complianceFrameworkVersions.id, previous.id), eq(complianceFrameworkVersions.status, "published")));
    const scope = { organizationId: current.organizationId, siteId: current.siteId, programId: current.id };
    await recordAudit(tx, actor, {
      action: "launch.teacher_policy.revise", resourceType: "compliance_framework_version", resourceId: created.id, scope,
      before: { versionId: previous.id, version: previous.version, qualificationKeys: previous.qualificationKeys,
        effectiveFrom: previous.effectiveFrom, effectiveThrough: previous.effectiveThrough },
      after: { version: nextVersion, qualificationKeys: keys, effectiveFrom: effectiveFrom.toISOString(),
        previousVersionId: previous.id, previousEffectiveThrough: effectiveFrom.toISOString(),
        reason: input.reason, confirmed: true },
    });
    await emitEvent(tx, {
      eventType: EventTypes.TeacherQualificationPolicyRevised, aggregateType: "compliance_framework_version",
      aggregateId: created.id, actorPersonId: actor.actorPersonId, ...scope,
      payload: { previousVersionId: previous.id, version: nextVersion, qualificationKeys: keys,
        effectiveFrom: effectiveFrom.toISOString() },
    });
    return { versionId: created.id, created: true };
  });
}

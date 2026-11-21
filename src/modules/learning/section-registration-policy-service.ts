import { eq, inArray } from "drizzle-orm";
import {
  sectionPrerequisites,
  sectionRegistrationPolicies,
  sections,
  terms,
} from "@/db/schema";
import { db } from "@/db/client";

export type EffectiveRegistrationPolicy = {
  enrollmentCapacity: number;
  prerequisites: string[];
  addDropEndsOn: string;
  withdrawalEndsOn: string;
  credits: number;
  maxCreditsPerTerm: number;
  guardianApprovalRequired: boolean;
  approvalMode: string;
};

export async function getSectionRegistrationPolicy(
  sectionId: string,
  executor: any = db,
): Promise<EffectiveRegistrationPolicy> {
  const [row] = await executor
    .select({
      policy: sectionRegistrationPolicies,
      sectionMetadata: sections.metadata,
      startsOn: terms.startsOn,
      endsOn: terms.endsOn,
    })
    .from(sections)
    .innerJoin(terms, eq(terms.id, sections.termId))
    .leftJoin(sectionRegistrationPolicies, eq(sectionRegistrationPolicies.sectionId, sections.id))
    .where(eq(sections.id, sectionId))
    .limit(1);

  if (!row) throw new Error("Section not found");

  const prerequisites = row.policy
    ? await executor
        .select({ code: sectionPrerequisites.prerequisiteCourseCode })
        .from(sectionPrerequisites)
        .where(eq(sectionPrerequisites.sectionId, sectionId))
    : [];

  return effectivePolicy(row, prerequisites.map(p => p.code));
}

/** Normalizes current saved rules and pre-migration fallback identically. */
function effectivePolicy(row: {
  policy: typeof sectionRegistrationPolicies.$inferSelect | null;
  sectionMetadata: typeof sections.$inferSelect["metadata"];
  startsOn: string;
  endsOn: string;
}, prerequisites: string[]): EffectiveRegistrationPolicy {
  if (row.policy) {
    return {
      enrollmentCapacity: row.policy.enrollmentCapacity,
      prerequisites,
      addDropEndsOn: row.policy.addDropEndsOn,
      withdrawalEndsOn: row.policy.withdrawalEndsOn,
      credits: Number(row.policy.credits),
      maxCreditsPerTerm: Number(row.policy.maxCreditsPerTerm),
      guardianApprovalRequired: row.policy.guardianApprovalRequired,
      approvalMode: row.policy.approvalMode,
    };
  }

  // Temporary compatibility for pre-migration fixture data. New writes go to
  // canonical tables; callers should not write registration rules into metadata.
  const raw = row.sectionMetadata.registrationPolicy;
  const legacy = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown>
    : {};
  return {
    enrollmentCapacity: typeof legacy.capacity === "number" ? legacy.capacity : 30,
    prerequisites: Array.isArray(legacy.prerequisites)
      ? legacy.prerequisites.filter((v): v is string => typeof v === "string")
      : [],
    addDropEndsOn: typeof legacy.addDropEndsOn === "string" ? legacy.addDropEndsOn : row.startsOn,
    withdrawalEndsOn: typeof legacy.withdrawalEndsOn === "string" ? legacy.withdrawalEndsOn : row.endsOn,
    credits: typeof row.sectionMetadata.credits === "number" ? row.sectionMetadata.credits : 1,
    maxCreditsPerTerm: typeof row.sectionMetadata.maxCreditsPerTerm === "number"
      ? row.sectionMetadata.maxCreditsPerTerm
      : 7,
    guardianApprovalRequired: false,
    approvalMode: "registrar",
  };

/**
 * Read policies for an already authorized list of Section IDs.
 * Exactly two bounded queries replace 1-2 queries per catalog Section.
 * Caller must establish Site/Program access before providing IDs.
 */
export async function getSectionRegistrationPolicies(
  sectionIds: readonly string[],
): Promise<Map<string, EffectiveRegistrationPolicy>> {
  const unique = [...new Set(sectionIds)];
  const result = new Map<string, EffectiveRegistrationPolicy>();
  if (!unique.length) return result;
  const [rows, prerequisites] = await Promise.all([
    db.select({
      id: sections.id,
      policy: sectionRegistrationPolicies,
      sectionMetadata: sections.metadata,
      startsOn: terms.startsOn,
      endsOn: terms.endsOn,
    }).from(sections)
      .innerJoin(terms, eq(terms.id, sections.termId))
      .leftJoin(sectionRegistrationPolicies, eq(sectionRegistrationPolicies.sectionId, sections.id))
      .where(inArray(sections.id, unique)),
    db.select({sectionId:sectionPrerequisites.sectionId, code:sectionPrerequisites.prerequisiteCourseCode})
      .from(sectionPrerequisites).where(inArray(sectionPrerequisites.sectionId, unique)),
  ]);
  const prerequisitesById = new Map<string, string[]>();
  for (const item of prerequisites) {
    const codes = prerequisitesById.get(item.sectionId) ?? [];
    codes.push(item.code);
    prerequisitesById.set(item.sectionId, codes);
  }
  for (const row of rows) result.set(row.id, effectivePolicy(row, prerequisitesById.get(row.id) ?? []));
  if (result.size !== unique.length) throw new Error("Section not found");
  return result;
}


export async function replaceSectionRegistrationPolicy(
  executor: any,
  input: {
    sectionId: string;
    enrollmentCapacity: number;
    prerequisites: string[];
    addDropEndsOn: string;
    withdrawalEndsOn: string;
    credits: number;
    maxCreditsPerTerm: number;
    guardianApprovalRequired?: boolean;
    approvalMode?: string;
  },
): Promise<void> {
  await executor
    .insert(sectionRegistrationPolicies)
    .values({
      sectionId: input.sectionId,
      enrollmentCapacity: input.enrollmentCapacity,
      addDropEndsOn: input.addDropEndsOn,
      withdrawalEndsOn: input.withdrawalEndsOn,
      credits: String(input.credits),
      maxCreditsPerTerm: String(input.maxCreditsPerTerm),
      guardianApprovalRequired: input.guardianApprovalRequired ?? false,
      approvalMode: input.approvalMode ?? "registrar",
    })
    .onConflictDoUpdate({
      target: sectionRegistrationPolicies.sectionId,
      set: {
        enrollmentCapacity: input.enrollmentCapacity,
        addDropEndsOn: input.addDropEndsOn,
        withdrawalEndsOn: input.withdrawalEndsOn,
        credits: String(input.credits),
        maxCreditsPerTerm: String(input.maxCreditsPerTerm),
        guardianApprovalRequired: input.guardianApprovalRequired ?? false,
        approvalMode: input.approvalMode ?? "registrar",
        updatedAt: new Date(),
      },
    });

  await executor.delete(sectionPrerequisites)
    .where(eq(sectionPrerequisites.sectionId, input.sectionId));

  if (input.prerequisites.length) {
    await executor.insert(sectionPrerequisites).values(
      [...new Set(input.prerequisites)].map(code => ({
        sectionId: input.sectionId,
        prerequisiteCourseCode: code,
      })),
    );
  }
}

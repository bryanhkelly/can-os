import { db } from "@/db/client";
import * as s from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { guardianRelationshipPredicate } from "@/domain/guardian-relationship";
import { validateGroupInput } from "@/domain/study-groups";
import { recordAudit,requireActor } from "@/modules/identity/actors.server";
import { emitEvent,notify,notifyMany } from "@/platform/mutation";
import { createServerFn } from "@tanstack/react-start";
import { and,asc,desc,eq,inArray,isNull,sql } from "drizzle-orm";
import { z } from "zod";
import { assertGroupScope,eligibleStudent } from "./canonical-membership.server";

import { EventTypes } from "@/domain/event-types";
const uuid = z.string().uuid();

export const createStudentStudyGroup = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    sectionId: uuid,
    title: z.string().min(3).max(100),
    description: z.string().min(10).max(2000),
    inviteePersonIds: z.array(uuid).min(1).max(30)
      .refine(ids => new Set(ids).size === ids.length, "Choose each classmate only once."),
    maxMembers: z.number().int().min(2).max(50),
  }).refine(input => input.inviteePersonIds.length < input.maxMembers, {
    message: "Group capacity must include every invite and the organizer.",
    path: ["maxMembers"],
  }).parse(value))
  .handler(async ({ data }) => {
    const actor = await requireActor(["student"]);
    const valid = validateGroupInput({ ...data, kind: "course" });
    return db.transaction(async tx => {
      const [section] = await tx.select({
        id: s.sections.id, siteId: s.sections.siteId, programId: s.sections.programId,
        facilitatorPersonId: s.sectionTeachers.personId,
      }).from(s.sections)
        .innerJoin(s.programs, eq(s.programs.id, s.sections.programId))
        .innerJoin(s.sectionTeachers, eq(s.sectionTeachers.sectionId, s.sections.id))
        .where(and(eq(s.sections.id, data.sectionId), eq(s.sections.active, true),
          eq(s.programs.status, "active"),
          inArray(s.sections.siteId, actor.scope.siteIds ?? []),
          inArray(s.sections.programId, actor.scope.programIds ?? [])))
        .orderBy(asc(s.sectionTeachers.createdAt), asc(s.sectionTeachers.id))
        .limit(1);
      if (!section?.siteId) throw new AuthorizationError("active class with an assigned facilitator");
      const scope = { ...section, sectionId: section.id };
      assertGroupScope(actor, scope);
      await eligibleStudent(tx, actor.actorPersonId, scope, actor.scope.programIds ?? []);
      if (data.inviteePersonIds.includes(actor.actorPersonId))
        throw new Error("Choose classmates other than yourself.");
      for (const inviteePersonId of data.inviteePersonIds)
        await eligibleStudent(tx, inviteePersonId, scope, actor.scope.programIds ?? []);

      const [group] = await tx.insert(s.studyGroups).values({
        ...valid, sectionId: section.id, siteId: section.siteId, programId: section.programId,
        facilitatorPersonId: section.facilitatorPersonId, visibility: "site",
        requiresApproval: true,
        metadata: { createdByStudentPersonId: actor.actorPersonId },
      }).returning({ id: s.studyGroups.id });
      if (!group) throw new Error("Unable to create study group");
      const guardians = await tx.select({
        guardianPersonId: s.guardianRelationships.guardianPersonId,
      }).from(s.guardianRelationships).where(guardianRelationshipPredicate({
        studentPersonId: actor.actorPersonId, access: "enrollment",
      }));
      if (!guardians.length)
        throw new Error("A linked guardian is required for study group participation.");
      const [membership] = await tx.insert(s.studyGroupMemberships).values({
        groupId: group.id, personId: actor.actorPersonId, role: "student", status: "pending",
      }).returning({ id: s.studyGroupMemberships.id });
      if (!membership) throw new Error("Unable to request study group membership");
      for (const guardianPersonId of new Set(guardians.map(g => g.guardianPersonId))) {
        await tx.insert(s.actions).values({
          type: "study_group_consent", status: "open", priority: "normal",
          title: "Study group permission: " + valid.title,
          ownerPersonId: guardianPersonId, siteId: section.siteId,
          programId: section.programId, subjectType: "study_group", subjectId: group.id,
          metadata: { studentPersonId: actor.actorPersonId, membershipId: membership.id },
        });
      }
      await notifyMany(tx, [
        ...[...new Set(guardians.map(g => g.guardianPersonId))].map(recipientPersonId => ({
          recipientPersonId, type: "study_group_consent_requested", status: "unread" as const,
          title: "Study group permission requested", body: "Review a student's group request.",
          resourceType: "study_group", resourceId: group.id,
        })),
        { recipientPersonId: section.facilitatorPersonId,
          type: "study_group_membership_request", status: "unread" as const,
          title: "Study group membership requested", body: "A student requested to join " + valid.title,
          resourceType: "study_group", resourceId: group.id },
        ...data.inviteePersonIds.map(recipientPersonId => ({
          recipientPersonId, type: "study_group_invitation", status: "unread" as const,
          title: "Study group invitation",
          body: `You were invited to ${valid.title}. Request membership in Study Groups; guardian permission and facilitator approval may be required.`,
          resourceType: "study_group", resourceId: group.id,
        })),
      ]);
      await recordAudit(tx, actor, {
        action: "study_group.create", resourceType: "study_group", resourceId: group.id,
        scope: { siteId: section.siteId, programId: section.programId, sectionId: section.id },
        after: {
          title: valid.title, kind: valid.kind, maxMembers: valid.maxMembers,
          invitedClassmateCount: data.inviteePersonIds.length,
        },
      });
      await recordAudit(tx, actor, {
        action: "study_group.membership.request", resourceType: "study_group_membership",
        resourceId: membership.id,
        scope: { siteId: section.siteId, programId: section.programId, sectionId: section.id },
        after: { status: "pending", studentPersonId: actor.actorPersonId },
      });
      await emitEvent(tx, {
        eventType: EventTypes.StudyGroupCreated, aggregateType: "study_group",
        aggregateId: group.id, actorPersonId: actor.actorPersonId,
        payload: {
          sectionId: section.id, siteId: section.siteId, programId: section.programId,
          createdByStudent: true, invitedClassmateCount: data.inviteePersonIds.length,
        },
      });
      await emitEvent(tx, {
        eventType: EventTypes.StudyGroupMembershipRequested, aggregateType: "study_group_membership",
        aggregateId: membership.id, actorPersonId: actor.actorPersonId,
        payload: { groupId: group.id },
      });
      return { groupId: group.id };
    });
  });

export const createFacilitatedGroup = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.union([z.object({
    sectionId: uuid,
    title: z.string().min(3).max(100),
    description: z.string().min(10).max(2000),
    maxMembers: z.number().int().min(2).max(50),
  }), z.object({
    siteId: uuid, programId: uuid.nullish(), kind: z.enum(["course", "interest"]),
    title: z.string().min(3).max(100),
    description: z.string().min(10).max(2000),
    maxMembers: z.number().int().min(2).max(50),
  }).refine(input => input.kind !== "course" || Boolean(input.programId), {
    message: "Course study groups require a program",
  })]).parse(value))
  .handler(async ({ data }) => {
    const actor = await requireActor(["teacher"]);
    const valid = validateGroupInput({ ...data, kind: "kind" in data ? data.kind : "course" });
    return db.transaction(async tx => {
      const [section] = await tx.select({
        id: s.sections.id, siteId: s.sections.siteId, programId: s.sections.programId,
      }).from(s.sections)
        .innerJoin(s.sectionTeachers, eq(s.sectionTeachers.sectionId, s.sections.id))
        .where(and(
          "sectionId" in data ? eq(s.sections.id, data.sectionId) : and(
            eq(s.sections.siteId, data.siteId),
            data.programId ? eq(s.sections.programId, data.programId) : undefined),
          eq(s.sectionTeachers.personId, actor.actorPersonId),
          eq(s.sections.active, true),
          inArray(s.sections.siteId, actor.scope.siteIds ?? []),
          inArray(s.sections.programId, actor.scope.programIds ?? []))).limit(1);
      if (!section || !section.siteId) throw new AuthorizationError("active teaching assignment");
      const scope = {
        id: section.id, siteId: section.siteId,
        programId: "sectionId" in data ? section.programId : data.programId ?? null,
        sectionId: "sectionId" in data ? section.id : null,
      };
      assertGroupScope(actor, scope);
      const [group] = await tx.insert(s.studyGroups).values({
        ...valid, sectionId: scope.sectionId, siteId: scope.siteId, programId: scope.programId,
        facilitatorPersonId: actor.actorPersonId, visibility: "site", requiresApproval: true,
      }).returning({ id: s.studyGroups.id });
      if (!group) throw new Error("Unable to create study group");
      await recordAudit(tx, actor, {
        action: "study_group.create", resourceType: "study_group", resourceId: group.id,
        scope,
        after: { title: valid.title, kind: valid.kind, maxMembers: valid.maxMembers },
      });
      await emitEvent(tx, {
        eventType: EventTypes.StudyGroupCreated, aggregateType: "study_group",
        aggregateId: group.id, actorPersonId: actor.actorPersonId,
        payload: { sectionId: scope.sectionId, siteId: scope.siteId, programId: scope.programId },
      });
      return { groupId: group.id };
    });
  });

export const requestCanonicalGroupMembership = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ groupId: uuid }).parse(value))
  .handler(async ({ data }) => {
    const actor = await requireActor(["student"]);
    return db.transaction(async tx => {
      // All request/re-request and capacity decisions serialize on this group row.
      const [group] = await tx.select().from(s.studyGroups)
        .where(and(eq(s.studyGroups.id, data.groupId), eq(s.studyGroups.status, "active")))
        .for("update").limit(1);
      if (!group) throw new Error("Study group not available");
      assertGroupScope(actor, group);
      await eligibleStudent(tx, actor.actorPersonId, group, actor.scope.programIds ?? []);
      const guardians = await tx.select({ guardianPersonId: s.guardianRelationships.guardianPersonId })
        .from(s.guardianRelationships).where(guardianRelationshipPredicate({
          studentPersonId: actor.actorPersonId, access: "enrollment",
        }));
      // K-12 school groups fail closed when no authorized enrollment guardian exists.
      if (!guardians.length) throw new Error("A linked guardian is required for study group participation.");
      const [existing] = await tx.select().from(s.studyGroupMemberships)
        .where(and(eq(s.studyGroupMemberships.groupId, group.id),
          eq(s.studyGroupMemberships.personId, actor.actorPersonId))).limit(1);
      if (existing?.status === "approved" || existing?.status === "pending") {
        return { membershipId: existing.id, pending: existing.status === "pending" };
      }
      let membershipId: string;
      if (existing) {
        await tx.update(s.studyGroupMemberships).set({
          status: "pending", reviewedByPersonId: null, joinedAt: null, updatedAt: new Date(),
        }).where(eq(s.studyGroupMemberships.id, existing.id));
        membershipId = existing.id;
      } else {
        const [created] = await tx.insert(s.studyGroupMemberships).values({
          groupId: group.id, personId: actor.actorPersonId, role: "student", status: "pending",
        }).returning({ id: s.studyGroupMemberships.id });
        if (!created) throw new Error("Unable to request membership");
        membershipId = created.id;
      }
      for (const guardian of guardians) {
        const prior = await tx.select().from(s.actions)
          .where(and(eq(s.actions.type, "study_group_consent"),
            eq(s.actions.subjectType, "study_group"),
            eq(s.actions.subjectId, group.id),
            eq(s.actions.ownerPersonId, guardian.guardianPersonId)));
        const matching = prior.find(a => a.metadata.studentPersonId === actor.actorPersonId);
        if (matching) {
          await tx.update(s.actions).set({
            status: "open", resolvedAt: null, resolutionNote: null,
            metadata: { ...matching.metadata, studentPersonId: actor.actorPersonId,
              membershipId, decision: null }, updatedAt: new Date(),
          }).where(eq(s.actions.id, matching.id));
        } else {
          await tx.insert(s.actions).values({
            type: "study_group_consent", status: "open", priority: "normal",
            title: "Study group permission: " + group.title,
            ownerPersonId: guardian.guardianPersonId, siteId: group.siteId,
            programId: group.programId, subjectType: "study_group", subjectId: group.id,
            metadata: { studentPersonId: actor.actorPersonId, membershipId },
          });
        }
      }
      await notifyMany(tx, [
        ...[...new Set(guardians.map(g => g.guardianPersonId))].map(recipientPersonId => ({
          recipientPersonId, type: "study_group_consent_requested", status: "unread" as const,
          title: "Study group permission requested", body: "Review a student's group request.",
          resourceType: "study_group", resourceId: group.id,
        })),
        { recipientPersonId: group.facilitatorPersonId,
          type: "study_group_membership_request", status: "unread" as const,
          title: "Study group membership requested", body: "A student requested to join " + group.title,
          resourceType: "study_group", resourceId: group.id },
      ]);
      await recordAudit(tx, actor, {
        action: "study_group.membership.request", resourceType: "study_group_membership",
        resourceId: membershipId, scope: { siteId: group.siteId, programId: group.programId },
        after: { status: "pending", studentPersonId: actor.actorPersonId },
      });
      await emitEvent(tx, {
        eventType: EventTypes.StudyGroupMembershipRequested, aggregateType: "study_group_membership",
        aggregateId: membershipId, actorPersonId: actor.actorPersonId, payload: { groupId: group.id },
      });
      return { membershipId, pending: true };
    });
  });

export const decideCanonicalGroupConsent = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    actionId: uuid, approve: z.boolean(), acknowledged: z.boolean().default(false),
  }).parse(value))
  .handler(async ({ data }) => {
    const actor = await requireActor(["guardian"]);
    if (data.approve && !data.acknowledged) throw new Error("Confirm the student's participation.");
    return db.transaction(async tx => {
      const [action] = await tx.select().from(s.actions)
        .where(and(eq(s.actions.id, data.actionId), eq(s.actions.ownerPersonId, actor.actorPersonId),
          eq(s.actions.type, "study_group_consent"), eq(s.actions.subjectType, "study_group"),
          eq(s.actions.status, "open"))).for("update").limit(1);
      if (!action || !action.subjectId) throw new AuthorizationError("pending guardian group consent");
      const studentPersonId = action.metadata.studentPersonId;
      const membershipId = action.metadata.membershipId;
      if (typeof studentPersonId !== "string") throw new AuthorizationError("consent subject");
      const [relationship] = await tx.select({ id: s.guardianRelationships.id })
        .from(s.guardianRelationships).where(guardianRelationshipPredicate({
          studentPersonId, guardianPersonId: actor.actorPersonId, access: "enrollment",
        })).limit(1);
      if (!relationship) throw new AuthorizationError("guardian permission");
      const [group] = await tx.select().from(s.studyGroups)
        .where(and(eq(s.studyGroups.id, action.subjectId), eq(s.studyGroups.status, "active")))
        .limit(1);
      if (!group) throw new AuthorizationError("active study group");
      assertGroupScope(actor, group);
      const [member] = await tx.select({ id: s.studyGroupMemberships.id })
        .from(s.studyGroupMemberships)
        .where(and(eq(s.studyGroupMemberships.groupId, group.id),
          eq(s.studyGroupMemberships.personId, studentPersonId),
          eq(s.studyGroupMemberships.status, "pending"))).limit(1);
      // Legacy consent actions carry no membershipId: they cover the student's
      // current pending membership for the group, and become obsolete once the
      // student withdrew or the membership was otherwise decided.
      if (!member && !membershipId) {
        await tx.update(s.actions).set({
          status: "cancelled", resolvedAt: new Date(),
          resolutionNote: "Membership request is no longer pending",
          metadata: { ...action.metadata, decision: "obsolete" }, updatedAt: new Date(),
        }).where(eq(s.actions.id, action.id));
        await recordAudit(tx, actor, {
          action: "study_group.guardian.consent_obsolete", resourceType: "action",
          resourceId: action.id,
          scope: { siteId: group.siteId, programId: group.programId },
          before: { status: action.status }, after: { status: "cancelled", reason: "obsolete" },
        });
        return { saved: true, obsolete: true };
      }
      if (!member || (membershipId && membershipId !== member.id))
        throw new AuthorizationError("pending student membership");
      await eligibleStudent(tx, studentPersonId, group, actor.scope.programIds ?? []);
      const [consent] = await tx.insert(s.consentRecords).values({
        subjectType: "study_group_membership", subjectId: member.id,
        consentType: "study_group_participation", signerPersonId: actor.actorPersonId,
        version: "study-group/v1", signatureEvidence: {
          decision: data.approve ? "approve" : "decline", groupId: group.id,
          studentPersonId, acknowledged: data.approve && data.acknowledged,
          accountId: actor.accountId, sessionId: actor.sessionId,
        },
      }).returning({ id: s.consentRecords.id });
      if (!consent) throw new Error("Unable to record consent");
      await tx.update(s.actions).set({
        status: "resolved", resolvedAt: new Date(),
        resolutionNote: data.approve ? "Guardian approved" : "Guardian declined",
        metadata: { ...action.metadata, membershipId: member.id,
          decision: data.approve ? "approve" : "decline", consentRecordId: consent.id },
        updatedAt: new Date(),
      }).where(eq(s.actions.id, action.id));
      await notify(tx, {
        recipientPersonId: group.facilitatorPersonId,
        type: "study_group_guardian_consent", status: "unread",
        title: data.approve ? "Guardian approved group participation" : "Guardian declined group participation",
        body: "A guardian decision was recorded for " + group.title,
        resourceType: "study_group", resourceId: group.id,
      });
      await recordAudit(tx, actor, {
        action: data.approve ? "study_group.guardian.approve" : "study_group.guardian.decline",
        resourceType: "study_group_membership", resourceId: member.id,
        scope: { siteId: group.siteId, programId: group.programId },
        after: { consentRecordId: consent.id, approved: data.approve },
      });
      await emitEvent(tx, {
        eventType: EventTypes.StudyGroupGuardianConsentDecided, aggregateType: "study_group_membership",
        aggregateId: member.id, actorPersonId: actor.actorPersonId,
        payload: { groupId: group.id, approved: data.approve, consentRecordId: consent.id },
      });
      return { saved: true };
    });
  });

export const decideCanonicalGroupMembership = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({
    groupId: uuid, studentPersonId: uuid, approve: z.boolean(),
  }).parse(value))
  .handler(async ({ data }) => {
    const actor = await requireActor(["teacher"]);
    return db.transaction(async tx => {
      const [group] = await tx.select().from(s.studyGroups)
        .where(and(eq(s.studyGroups.id, data.groupId), eq(s.studyGroups.status, "active"),
          eq(s.studyGroups.facilitatorPersonId, actor.actorPersonId))).for("update").limit(1);
      if (!group || data.studentPersonId === actor.actorPersonId)
        throw new AuthorizationError("facilitator group membership approval");
      assertGroupScope(actor, group);
      if (group.sectionId) {
        const [assignment] = await tx.select({ id: s.sectionTeachers.id }).from(s.sectionTeachers)
          .innerJoin(s.sections, eq(s.sections.id, s.sectionTeachers.sectionId))
          .where(and(eq(s.sectionTeachers.sectionId, group.sectionId),
            eq(s.sectionTeachers.personId, actor.actorPersonId),
            eq(s.sections.active, true))).limit(1);
        if (!assignment) throw new AuthorizationError("current teaching assignment");
      }
      const [member] = await tx.select().from(s.studyGroupMemberships)
        .where(and(eq(s.studyGroupMemberships.groupId, group.id),
          eq(s.studyGroupMemberships.personId, data.studentPersonId),
          eq(s.studyGroupMemberships.status, "pending"))).for("update").limit(1);
      if (!member) throw new Error("Pending membership not found");
      if (data.approve) {
        await eligibleStudent(tx, data.studentPersonId, group, actor.scope.programIds ?? []);
        const guardians = await tx.select({ personId: s.guardianRelationships.guardianPersonId })
          .from(s.guardianRelationships).where(guardianRelationshipPredicate({
            studentPersonId: data.studentPersonId, access: "enrollment",
          }));
        if (!guardians.length) throw new Error("Guardian consent is required.");
        const guardianActions = await tx.select().from(s.actions)
          .where(and(eq(s.actions.type, "study_group_consent"),
            eq(s.actions.subjectType, "study_group"),
            eq(s.actions.subjectId, group.id),
            inArray(s.actions.ownerPersonId, guardians.map(g => g.personId))));
        const decisions = guardians.map(g => guardianActions
          .find(a => a.ownerPersonId === g.personId &&
            a.metadata.studentPersonId === data.studentPersonId &&
            a.metadata.membershipId === member.id));
        if (decisions.some(a => !a || a.status !== "resolved" ||
            a.metadata.decision !== "approve"))
          throw new Error("Every current enrollment guardian must approve this membership.");
        const approvals = await tx.select({
          signerPersonId: s.consentRecords.signerPersonId,
          evidence: s.consentRecords.signatureEvidence,
        }).from(s.consentRecords).where(and(
          eq(s.consentRecords.subjectType, "study_group_membership"),
          eq(s.consentRecords.subjectId, member.id),
          eq(s.consentRecords.consentType, "study_group_participation"),
          eq(s.consentRecords.version, "study-group/v1"), isNull(s.consentRecords.revokedAt),
        )).orderBy(desc(s.consentRecords.signedAt), desc(s.consentRecords.createdAt));
        for (const guardian of guardians) {
          const approved = approvals.find(a => a.signerPersonId === guardian.personId &&
            a.evidence.studentPersonId === data.studentPersonId && a.evidence.groupId === group.id);
          if (!approved || approved.evidence.decision !== "approve" ||
              approved.evidence.acknowledged !== true)
            throw new Error("Missing current guardian consent evidence.");
        }
        const [occupied] = await tx.select({ total: sql<number>`count(*)::int` })
          .from(s.studyGroupMemberships).where(and(
            eq(s.studyGroupMemberships.groupId, group.id),
            eq(s.studyGroupMemberships.status, "approved")));
        if ((occupied?.total ?? 0) >= group.maxMembers) throw new Error("Study group is full");
      }
      await tx.update(s.studyGroupMemberships).set({
        status: data.approve ? "approved" : "declined",
        reviewedByPersonId: actor.actorPersonId,
        joinedAt: data.approve ? new Date() : null, updatedAt: new Date(),
      }).where(eq(s.studyGroupMemberships.id, member.id));
      await notify(tx, {
        recipientPersonId: data.studentPersonId, status: "unread",
        type: "study_group_membership_decision",
        title: data.approve ? "Study group membership approved" : "Study group membership declined",
        body: data.approve ? "You may now participate in " + group.title : "Your request was declined.",
        resourceType: "study_group", resourceId: group.id,
      });
      await recordAudit(tx, actor, {
        action: data.approve ? "study_group.membership.approve" : "study_group.membership.decline",
        resourceType: "study_group_membership", resourceId: member.id,
        scope: { siteId: group.siteId, programId: group.programId },
        before: { status: "pending" }, after: { status: data.approve ? "approved" : "declined" },
      });
      await emitEvent(tx, {
        eventType: EventTypes.StudyGroupMembershipDecided, aggregateType: "study_group_membership",
        aggregateId: member.id, actorPersonId: actor.actorPersonId,
        payload: { groupId: group.id, approved: data.approve },
      });
      return { saved: true };
    });
  });

export const leaveCanonicalGroup = createServerFn({ method: "POST" })
  .validator((value: unknown) => z.object({ groupId: uuid }).parse(value))
  .handler(async ({ data }) => {
    const actor = await requireActor(["student"]);
    return db.transaction(async tx => {
      const [group] = await tx.select().from(s.studyGroups)
        .where(eq(s.studyGroups.id, data.groupId)).for("update").limit(1);
      if (!group) throw new Error("Group not found");
      assertGroupScope(actor, group);
      const [member] = await tx.select().from(s.studyGroupMemberships)
        .where(and(eq(s.studyGroupMemberships.groupId, group.id),
          eq(s.studyGroupMemberships.personId, actor.actorPersonId))).limit(1);
      if (!member || member.status === "left") return { saved: true };
      await tx.update(s.studyGroupMemberships).set({
        status: "left", updatedAt: new Date(),
      }).where(eq(s.studyGroupMemberships.id, member.id));
      const consents = await tx.select().from(s.actions).where(and(
        eq(s.actions.type, "study_group_consent"),
        eq(s.actions.subjectId, group.id), eq(s.actions.status, "open"),
      ));
      for (const action of consents.filter(a => a.metadata.studentPersonId === actor.actorPersonId)) {
        await tx.update(s.actions).set({ status: "cancelled", resolvedAt: new Date(),
          resolutionNote: "Student left group", updatedAt: new Date() })
          .where(eq(s.actions.id, action.id));
      }
      await recordAudit(tx, actor, {
        action: "study_group.membership.leave", resourceType: "study_group_membership",
        resourceId: member.id, scope: { siteId: group.siteId, programId: group.programId },
        before: { status: member.status }, after: { status: "left" },
      });
      return { saved: true };
    });
  });

import { createServerFn } from "@tanstack/react-start";
import { setResponseHeader } from "@tanstack/react-start/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { documents, journeyRequirements, journeys } from "@/db/schema";
import { requireActor } from "@/modules/identity/actors.server";
import { authorizeEnrollmentApplication } from "./enrollment-access.server";
import { enrollmentFormState } from "@/domain/enrollment-form";
import { enrollmentFormRevision } from "./enrollment-form.server";
import { enrollmentDocumentStorageVerified } from "@/domain/r2-document-access";

export const getGuardianEnrollmentChecklist = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ applicationId: z.string().uuid() }).strict().parse(input))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await requireActor(["guardian"], "enrollment.apply");
    const application = await authorizeEnrollmentApplication(actor, data.applicationId);
    const [journey] = await db.select({ id: journeys.id, status: journeys.status }).from(journeys)
      .where(and(eq(journeys.participantType, "application"), eq(journeys.participantId, application.id))).limit(1);
    if (!journey) throw new Error("Enrollment checklist is unavailable. Contact admissions.");
    const requirements = await db.select({ id: journeyRequirements.id, title: journeyRequirements.title,
      status: journeyRequirements.status, blocking: journeyRequirements.blocking, evidence: journeyRequirements.evidence,
      metadata: journeyRequirements.metadata })
      .from(journeyRequirements).where(eq(journeyRequirements.journeyId, journey.id))
      .orderBy(asc(journeyRequirements.createdAt), asc(journeyRequirements.id));
    const files = requirements.length ? await db.select({ id: documents.id, requirementId: documents.subjectId,
      fileName: documents.fileName, metadata: documents.metadata, createdAt: documents.createdAt })
      .from(documents).where(and(eq(documents.subjectType, "journey_requirement"),
        eq(documents.storageProvider, "cloudflare_r2"), eq(documents.category, "enrollment"),
        inArray(documents.subjectId, requirements.map(requirement => requirement.id))))
      .orderBy(asc(documents.createdAt), asc(documents.id)) : [];
    const closed = ["active", "complete", "cancelled"].includes(journey.status) ||
      ["withdrawn", "declined"].includes(application.stage);
    return { applicationId: application.id, journeyStatus: journey.status, closed, synthetic: application.metadata.synthetic === true,
      requirements: requirements.map(requirement => {
        const review = [...requirement.evidence].reverse().find(entry => entry.kind === "document_review");
        const state = enrollmentFormState(requirement.metadata, requirement.evidence);
        return { id: requirement.id, title: requirement.title, status: requirement.status, blocking: requirement.blocking,
          form: state ? { ...state, revision: enrollmentFormRevision(state.form) } : null,
          reviewStatus: typeof review?.status === "string" ? review.status : null,
          correctionReason: ["requested", "rejected"].includes(String(review?.status)) &&
            typeof review?.text === "string" ? review.text : null,
          documents: files.filter(file => file.requirementId === requirement.id &&
            file.metadata.applicationId === application.id).map(file => ({
              id: file.id, fileName: file.fileName, uploadedAt: file.createdAt.toISOString(),
              current: file.metadata.isCurrent !== false,
              reviewStatus: typeof file.metadata.reviewStatus === "string" ? file.metadata.reviewStatus : "received",
              canDownload: file.metadata.isCurrent !== false &&
                enrollmentDocumentStorageVerified(file.metadata,application.organizationId),
            })),
        };
      }),
    };
  });

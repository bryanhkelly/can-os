import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { z } from "zod";
import { extendedSeasonApprovalCategories } from "@/domain/extended-learning-approval";

const uuid = z.string().uuid();
const seasonInput = z.object({ seasonId: uuid }).strict();
const file = z.object({
  seasonId: uuid, category: z.enum(extendedSeasonApprovalCategories),
  expiresAt: z.string().datetime({ offset: true }),
  fileName: z.string().trim().min(1).max(150),
  mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]),
  size: z.number().int().min(16).max(10 * 1024 * 1024),
}).strict();
const review = z.object({
  seasonId: uuid, documentId: uuid, expectedVersion: z.number().int().positive(),
  decision: z.enum(["approve", "reject"]), reason: z.string().trim().min(10).max(2000),
}).strict();

async function serviceAndActor() {
  const [{ getCommandContext }, service] = await Promise.all([
    import("@/modules/identity/command-context.server"),
    import("./extended-learning-evidence.server"),
  ]);
  return { actor: await getCommandContext(getRequest()), service };
}

export const readExtendedEvidenceFn = createServerFn({ method: "GET" })
  .validator((input: unknown) => seasonInput.parse(input))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { actor, service } = await serviceAndActor();
    return service.readExtendedEvidence(actor, data.seasonId);
  });

export const listExtendedEvidenceReviewsFn = createServerFn({ method: "GET" })
  .handler(async () => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { actor, service } = await serviceAndActor();
    return service.listExtendedEvidenceReviews(actor);
  });

export const beginExtendedEvidenceUploadFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => file.parse(input))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { actor, service } = await serviceAndActor();
    return service.beginExtendedEvidenceUpload(actor, data);
  });

export const finishExtendedEvidenceUploadFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => file.extend({
    key: z.string().regex(/^extended-learning\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/i),
  }).parse(input))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { actor, service } = await serviceAndActor();
    return service.finishExtendedEvidenceUpload(actor, data);
  });

export const reviewExtendedEvidenceFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => review.parse(input))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { actor, service } = await serviceAndActor();
    return service.reviewExtendedEvidence(actor, data);
  });

export const getExtendedEvidenceDownloadFn = createServerFn({ method: "POST" })
  .validator((input: unknown) => z.object({ seasonId: uuid, documentId: uuid }).strict().parse(input))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const { actor, service } = await serviceAndActor();
    return service.getExtendedEvidenceDownload(actor, data);
  });

import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const uuid = z.string().uuid();
const requestSchema = z.object({
  programId: uuid,
  services: z.array(z.enum([
    "academic_instruction", "curriculum", "school_of_record",
    "credit_issuance", "admissions", "academic_records", "onsite_supervision",
  ])).min(1).max(7),
}).strict();
const reviewSchema = z.object({
  authorizationId: uuid,
  decision: z.enum(["approved","denied"]),
  reason: z.string().trim().min(10).max(500),
  evidenceDocumentId: uuid.optional(),
  effectiveFrom: z.string().datetime({offset:true}).optional(),
  effectiveThrough: z.string().datetime({offset:true}).optional(),
}).strict();
const revokeSchema = z.object({
  authorizationId: uuid,
  reason: z.string().trim().min(10).max(500),
}).strict();
const serviceEnum = z.enum([
  "academic_instruction", "curriculum", "school_of_record",
  "credit_issuance", "admissions", "academic_records", "onsite_supervision",
]);
const registerEvidenceSchema = z.object({
  programId: uuid,
  siteId: uuid,
  fileName: z.string().trim().min(1).max(150),
  effectiveThrough: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }),
  verifierPersonId: uuid,
  hostSignatureVerified: z.boolean(),
  institutionSignatureVerified: z.boolean(),
  authorizedServices: z.array(serviceEnum).min(1).max(7),
  storageKey: z.string().regex(/^operating-agreements\/[a-f0-9-]{36}\/[a-f0-9-]{36}$/i).optional(),
  mimeType: z.enum(["application/pdf", "image/jpeg", "image/png"]).optional(),
  fileSize: z.number().int().min(16).max(10 * 1024 * 1024).optional(),
}).strict();

/** No actor, approval status or contracting party may be supplied by a client. */
export const requestProgramSiteAuthorizationFn = createServerFn({ method:"POST" })
  .validator((value: unknown) => requestSchema.parse(value))
  .handler(async ({data}) => {
    const [{getCommandContext}, {requestProgramSiteAuthorization}] = await Promise.all([
      import("@/modules/identity/command-context.server"),
      import("./program-site-authorization.server"),
    ]);
    return requestProgramSiteAuthorization(await getCommandContext(getRequest()), data);
  });
export const reviewProgramSiteAuthorizationFn = createServerFn({ method:"POST" })
  .validator((value: unknown) => reviewSchema.parse(value))
  .handler(async ({data}) => {
    const [{getCommandContext}, {reviewProgramSiteAuthorization}] = await Promise.all([
      import("@/modules/identity/command-context.server"),
      import("./program-site-authorization.server"),
    ]);
    return reviewProgramSiteAuthorization(await getCommandContext(getRequest()), {
      ...data,
      effectiveFrom: data.effectiveFrom ? new Date(data.effectiveFrom) : undefined,
      effectiveThrough: data.effectiveThrough ? new Date(data.effectiveThrough) : undefined,
    });
  });
export const revokeProgramSiteAuthorizationFn = createServerFn({ method:"POST" })
  .validator((value: unknown) => revokeSchema.parse(value))
  .handler(async ({data}) => {
    const [{getCommandContext}, {revokeProgramSiteAuthorization}] = await Promise.all([
      import("@/modules/identity/command-context.server"),
      import("./program-site-authorization.server"),
    ]);
    return revokeProgramSiteAuthorization(await getCommandContext(getRequest()), data);
  });

/** Only the existing domain service can authorize institutional lifecycle changes. */
export const suspendProgramSiteAuthorizationFn = createServerFn({ method: "POST" })
  .validator((value: unknown) => revokeSchema.parse(value))
  .handler(async ({ data }) => {
    const [{ getCommandContext }, { suspendProgramSiteAuthorization }] = await Promise.all([
      import("@/modules/identity/command-context.server"),
      import("./program-site-authorization.server"),
    ]);
    return suspendProgramSiteAuthorization(await getCommandContext(getRequest()), data);
  });
export const resumeProgramSiteAuthorizationFn = createServerFn({ method: "POST" })
  .validator((value: unknown) => revokeSchema.parse(value))
  .handler(async ({ data }) => {
    const [{ getCommandContext }, { resumeProgramSiteAuthorization }] = await Promise.all([
      import("@/modules/identity/command-context.server"),
      import("./program-site-authorization.server"),
    ]);
    return resumeProgramSiteAuthorization(await getCommandContext(getRequest()), data);
  });

export const renewProgramSiteAuthorizationFn = createServerFn({ method: "POST" })
  .validator((value: unknown) => revokeSchema.extend({
    evidenceDocumentId: uuid,
    effectiveThrough: z.string().datetime({ offset: true }),
  }).strict().parse(value))
  .handler(async ({ data }) => {
    const [{ getCommandContext }, { renewProgramSiteAuthorization }] = await Promise.all([
      import("@/modules/identity/command-context.server"),
      import("./program-site-authorization.server"),
    ]);
    return renewProgramSiteAuthorization(await getCommandContext(getRequest()), {
      ...data, effectiveThrough: new Date(data.effectiveThrough),
    });
  });

/** Contracting parties, the exact Site and the issuer are never client input. */
export const registerOperatingAgreementEvidenceFn = createServerFn({ method:"POST" })
  .validator((value: unknown) => registerEvidenceSchema.parse(value))
  .handler(async ({data}) => {
    const [{getCommandContext}, {registerOperatingAgreementEvidence}] = await Promise.all([
      import("@/modules/identity/command-context.server"),
      import("./program-site-authorization.server"),
    ]);
    return registerOperatingAgreementEvidence(await getCommandContext(getRequest()), {
      ...data,
      effectiveThrough: new Date(data.effectiveThrough),
      expiresAt: new Date(data.expiresAt),
    });
  });

export const getHostProgramSiteAuthorizationFn = createServerFn({ method:"GET" })
  .validator((value: unknown) => z.object({programId: uuid}).strict().parse(value))
  .handler(async ({data}) => {
    const [{getCommandContext}, {getHostProgramSiteAuthorization}] = await Promise.all([
      import("@/modules/identity/command-context.server"),
      import("./program-site-authorization.server"),
    ]);
    return getHostProgramSiteAuthorization(await getCommandContext(getRequest()),data.programId);
  });
export const listCANOperatingAuthorizationDeskFn = createServerFn({ method:"GET" })
  .handler(async () => {
    const [{getCommandContext}, {listCANOperatingAuthorizationDesk}] = await Promise.all([
      import("@/modules/identity/command-context.server"),
      import("./program-site-authorization.server"),
    ]);
    return listCANOperatingAuthorizationDesk(await getCommandContext(getRequest()));
  });


export const listOperatingAgreementEvidenceFn = createServerFn({ method: "GET" })
  .validator((value: unknown) => z.object({
    authorizationId: uuid,
    effectiveThrough: z.string().datetime({ offset: true }),
  }).strict().parse(value))
  .handler(async ({ data }) => {
    const [{ getCommandContext }, { listOperatingAgreementEvidence }] = await Promise.all([
      import("@/modules/identity/command-context.server"),
      import("./program-site-authorization.server"),
    ]);
    return listOperatingAgreementEvidence(await getCommandContext(getRequest()), {
      ...data, effectiveThrough: new Date(data.effectiveThrough),
    });
  });

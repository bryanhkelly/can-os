import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const uuid = z.string().uuid();
const verifySchema = z.object({
  denominationOrganizationId: uuid,
  agreementReference: z.string().trim().min(4).max(100),
  evidenceDocumentId: uuid,
  validFrom: z.string().datetime({ offset: true }),
  validThrough: z.string().datetime({ offset: true }),
}).strict();
const provisionSchema = z.object({
  denominationOrganizationId: uuid,
  authorityDocumentId: uuid,
  email: z.string().trim().email().toLowerCase(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
}).strict();

/** Each call resolves an actual server session; browser-submitted actor is never trusted. */
export const listNetworkAgreementDesk = createServerFn({ method: "GET" }).handler(async () => {
  const [{ getCommandContext }, { listAgreementDesk }] = await Promise.all([
    import("@/modules/identity/command-context.server"),
    import("./network-steward.server"),
  ]);
  return listAgreementDesk(await getCommandContext(getRequest()));
});

export const verifyNetworkAgreement = createServerFn({ method: "POST" })
  .validator((value: unknown) => verifySchema.parse(value))
  .handler(async ({ data }) => {
    const [{ getCommandContext }, { verifyAgreement }] = await Promise.all([
      import("@/modules/identity/command-context.server"),
      import("./network-steward.server"),
    ]);
    return verifyAgreement(await getCommandContext(getRequest()), {
      ...data, validFrom: new Date(data.validFrom), validThrough: new Date(data.validThrough),
    });
  });

export const provisionDenominationHQOfficer = createServerFn({ method: "POST" })
  .validator((value: unknown) => provisionSchema.parse(value))
  .handler(async ({ data }) => {
    const [{ getCommandContext }, { provisionHQOfficer }] = await Promise.all([
      import("@/modules/identity/command-context.server"),
      import("./network-steward.server"),
    ]);
    return provisionHQOfficer(await getCommandContext(getRequest()), data);
  });

const churchBootstrapSchema = z.object({
  churchName: z.string().trim().min(2).max(160),
  churchSlug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  siteName: z.string().trim().min(2).max(160),
  siteSlug: z.string().trim().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  timezone: z.string().trim().min(3).max(80),
  contactEmail: z.string().trim().email().toLowerCase(),
  firstName: z.string().trim().min(1).max(80),
  lastName: z.string().trim().min(1).max(80),
  authorityDocumentId: uuid,
}).strict();

/**
 * A verified CAN steward prepares a new church and a site-bound launch lead.
 * The access grant remains inactive until the existing email-link invitation
 * is accepted; school-opening authority is never issued here.
 */
export const prepareChurchOnboarding = createServerFn({ method: "POST" })
  .validator((value: unknown) => churchBootstrapSchema.parse(value))
  .handler(async ({ data }) => {
    const [{ getCommandContext }, { bootstrapVerifiedChurch }] = await Promise.all([
      import("@/modules/identity/command-context.server"),
      import("./church-onboarding.server"),
    ]);
    return bootstrapVerifiedChurch(await getCommandContext(getRequest()), data);
  });

const churchVerificationSchema = z.object({
  requestId: uuid,
  evidenceReference: z.string().trim().min(8).max(500),
  verificationMethod: z.enum(["signed_authority", "denominational_confirmation", "independent_church_confirmation"]),
}).strict();
const churchDeclineSchema = z.object({
  requestId: uuid,
  note: z.string().trim().min(10).max(1000),
}).strict();

export const listChurchOnboardingRequests = createServerFn({ method: "GET" }).handler(async () => {
  const [{ getCommandContext }, { listChurchApplications }] = await Promise.all([
    import("@/modules/identity/command-context.server"),
    import("./church-applications.server"),
  ]);
  return listChurchApplications(await getCommandContext(getRequest()));
});

export const verifyChurchOnboardingRequest = createServerFn({ method: "POST" })
  .validator((value: unknown) => churchVerificationSchema.parse(value))
  .handler(async ({ data }) => {
    const [{ getCommandContext }, { verifyChurchApplication }] = await Promise.all([
      import("@/modules/identity/command-context.server"),
      import("./church-applications.server"),
    ]);
    return verifyChurchApplication(await getCommandContext(getRequest()), data);
  });

export const approveChurchOnboardingRequest = createServerFn({ method: "POST" })
  .validator((value: unknown) => uuid.parse(value))
  .handler(async ({ data }) => {
    const [{ getCommandContext }, { approveChurchApplication }] = await Promise.all([
      import("@/modules/identity/command-context.server"),
      import("./church-applications.server"),
    ]);
    return approveChurchApplication(await getCommandContext(getRequest()), data);
  });

export const declineChurchOnboardingRequest = createServerFn({ method: "POST" })
  .validator((value: unknown) => churchDeclineSchema.parse(value))
  .handler(async ({ data }) => {
    const [{ getCommandContext }, { declineChurchApplication }] = await Promise.all([
      import("@/modules/identity/command-context.server"),
      import("./church-applications.server"),
    ]);
    return declineChurchApplication(await getCommandContext(getRequest()), data.requestId, data.note);
  });

export const resendApprovedChurchInvitation = createServerFn({ method: "POST" })
  .validator((value: unknown) => uuid.parse(value))
  .handler(async ({ data }) => {
    const [{ getCommandContext }, { resendChurchInvitation }] = await Promise.all([
      import("@/modules/identity/command-context.server"),
      import("./church-applications.server"),
    ]);
    return resendChurchInvitation(await getCommandContext(getRequest()), data);
  });

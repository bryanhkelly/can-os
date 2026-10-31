import { z } from "zod";
import { publicAdmissionsInterestInput } from "./public-admissions-interest";

/**
 * This is an adult's own follow-up request, not consent supplied by the
 * registrar when importing a mailing list. No child or application data.
 */
export const invitedFamilyInterestInput = publicAdmissionsInterestInput
  .omit({ programId: true })
  .extend({
    invitationBatchId: z.string().uuid(),
    invitationRecipientKey: z.string().uuid(),
  }).strict();

export type InvitedFamilyInterestInput = z.infer<typeof invitedFamilyInterestInput>;

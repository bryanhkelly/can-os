import { z } from "zod";

const uuid = z.string().uuid();
const rules = z.array(z.object({ subject: z.string().trim().min(1), minimumUnits: z.number().positive().finite() })).min(1).refine(rows=>new Set(rows.map(row=>row.subject.toLocaleLowerCase())).size===rows.length,"Duplicate graduation subjects are not allowed");
export const approveGraduationRequirementsInput = z.object({issuerId:uuid,academicYear:z.string().min(4).max(40),version:z.string().min(1).max(40),cohortStart:z.string().regex(/^[0-9]{4}$/),cohortEnd:z.string().regex(/^[0-9]{4}$/),supersedesRequirementSetId:uuid.optional(),applicabilityReason:z.string().trim().min(12).max(1000),requirements:rules});
export const classifyLegacyGraduationRequirementsInput = z.object({
   issuerId:uuid,requirementSetId:uuid,
   cohortStart:z.string().regex(/^[0-9]{4}$/),cohortEnd:z.string().regex(/^[0-9]{4}$/),
   evidenceReference:z.string().trim().min(12).max(250),
   applicabilityReason:z.string().trim().min(20).max(1000),
 });
export const listGraduationRequirementsInput = z.object({issuerId:uuid});
export const listGraduationCandidatesInput = z.object({query:z.string().trim().min(2).max(100)});
export const getApplicableGraduationPolicyInput = z.object({transcriptId:uuid});
export const auditIssuedTranscriptInput = z.object({transcriptId:uuid,requirementSetId:uuid});
export const decideGraduationInput = z.object({transcriptId:uuid,requirementSetId:uuid,decision:z.enum(["approved","denied"]),rationale:z.string().trim().min(12).max(2000)});
export const listTranscriptDiplomasInput = z.object({transcriptId:uuid});
export const revokeDiplomaInput = z.object({diplomaId:uuid,reason:z.string().trim().min(12).max(2000)});
export const getDiplomaFreshnessInput = z.object({diplomaId:uuid});
export const issueDiplomaInput = z.object({decisionId:uuid});

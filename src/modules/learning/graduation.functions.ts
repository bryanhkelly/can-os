import { createServerFn } from "@tanstack/react-start";
import {
  approveGraduationRequirementsInput,
  classifyLegacyGraduationRequirementsInput,
  listGraduationRequirementsInput,
  listGraduationCandidatesInput,
  getApplicableGraduationPolicyInput,
  auditIssuedTranscriptInput,
  decideGraduationInput,
  listTranscriptDiplomasInput,
  revokeDiplomaInput,
  getDiplomaFreshnessInput,
  issueDiplomaInput,
} from "./graduation.inputs";

/** Browser-facing graduation commands; all privileged operations execute on the server. */

export const approveGraduationRequirements = createServerFn({ method: "POST" })
  .validator((input: unknown) => approveGraduationRequirementsInput.parse(input))
  .handler(async ({ data }) => {
    const implementation = await import("./graduation.server");
    return implementation.approveGraduationRequirements(data);
  });

export const classifyLegacyGraduationRequirements = createServerFn({ method: "POST" })
  .validator((input: unknown) => classifyLegacyGraduationRequirementsInput.parse(input))
  .handler(async ({ data }) => {
    const implementation = await import("./graduation.server");
    return implementation.classifyLegacyGraduationRequirements(data);
  });

export const listGraduationIssuers = createServerFn({ method: "GET" })
  .handler(async () => {
    const implementation = await import("./graduation.server");
    return implementation.listGraduationIssuers();
  });

export const listGraduationRequirements = createServerFn({ method: "GET" })
  .validator((input: unknown) => listGraduationRequirementsInput.parse(input))
  .handler(async ({ data }) => {
    const implementation = await import("./graduation.server");
    return implementation.listGraduationRequirements(data);
  });

export const listGraduationCandidates = createServerFn({ method: "GET" })
  .validator((input: unknown) => listGraduationCandidatesInput.parse(input))
  .handler(async ({ data }) => {
    const implementation = await import("./graduation.server");
    return implementation.listGraduationCandidates(data);
  });

export const getApplicableGraduationPolicy = createServerFn({ method: "GET" })
  .validator((input: unknown) => getApplicableGraduationPolicyInput.parse(input))
  .handler(async ({ data }) => {
    const implementation = await import("./graduation.server");
    return implementation.getApplicableGraduationPolicy(data);
  });

export const auditIssuedTranscript = createServerFn({ method: "GET" })
  .validator((input: unknown) => auditIssuedTranscriptInput.parse(input))
  .handler(async ({ data }) => {
    const implementation = await import("./graduation.server");
    return implementation.auditIssuedTranscript(data);
  });

export const decideGraduation = createServerFn({ method: "POST" })
  .validator((input: unknown) => decideGraduationInput.parse(input))
  .handler(async ({ data }) => {
    const implementation = await import("./graduation.server");
    return implementation.decideGraduation(data);
  });

export const listTranscriptDiplomas = createServerFn({ method: "GET" })
  .validator((input: unknown) => listTranscriptDiplomasInput.parse(input))
  .handler(async ({ data }) => {
    const implementation = await import("./graduation.server");
    return implementation.listTranscriptDiplomas(data);
  });

export const revokeDiploma = createServerFn({ method: "POST" })
  .validator((input: unknown) => revokeDiplomaInput.parse(input))
  .handler(async ({ data }) => {
    const implementation = await import("./graduation.server");
    return implementation.revokeDiploma(data);
  });

export const getDiplomaFreshness = createServerFn({ method: "GET" })
  .validator((input: unknown) => getDiplomaFreshnessInput.parse(input))
  .handler(async ({ data }) => {
    const implementation = await import("./graduation.server");
    return implementation.getDiplomaFreshness(data);
  });

export const issueDiploma = createServerFn({ method: "POST" })
  .validator((input: unknown) => issueDiplomaInput.parse(input))
  .handler(async ({ data }) => {
    const implementation = await import("./graduation.server");
    return implementation.issueDiploma(data);
  });

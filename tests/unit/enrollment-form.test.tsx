import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { enrollmentFormSchema, enrollmentFormState, enrollmentJourneyDefinitionKey, validateEnrollmentFormAnswers, type EnrollmentForm } from "@/domain/enrollment-form";
import { materializeJourneyRequirements } from "@/modules/journeys/instantiate";
import { GuardianEnrollmentForm, RegistrarEnrollmentFormReview, type EnrollmentFormRecord } from "@/components/enrollment/EnrollmentForm";

vi.mock("@/modules/enrollment/enrollment-form.functions", () => ({
  decideEnrollmentForm: vi.fn(), submitGuardianEnrollmentForm: vi.fn(),
}));
const form: EnrollmentForm = { version: "school-v1", instructions: "School-approved enrollment instructions.",
  consent: "School-approved statement to be acknowledged and signed.",
  fields: [{ key: "contact", label: "Preferred contact", type: "text", required: true },
    { key: "permission", label: "School contact allowed?", type: "yes_no", required: true },
    { key: "extra", label: "Optional information", type: "text", required: false }] };
const record: EnrollmentFormRecord = { form, submission: null, review: null, revision: "a".repeat(64) };
const submitted: EnrollmentFormRecord = { ...record, submission: { kind: "enrollment_form_submission",
  id: "a1000000-0000-4000-8000-000000000001", formRevision: record.revision, form,
  answers: { contact: "After school", permission: false }, signerPersonId: "a1000000-0000-4000-8000-000000000002",
  signerName: "Managing Guardian", signedAt: "2030-01-01T00:00:00.000Z" } };
describe("school-configured enrollment forms", () => {
  it("uses the program's configured packet without allowing a caller override", () => {
    expect(enrollmentJourneyDefinitionKey({ enrollmentJourneyDefinitionKey: "school-jurisdiction-2027" })).toBe("school-jurisdiction-2027");
    expect(() => enrollmentJourneyDefinitionKey({ enrollmentJourneyDefinitionKey: "school-2027" }, "other")).toThrow("cannot be overridden");
    expect(() => enrollmentJourneyDefinitionKey({ enrollmentJourneyDefinitionKey: "" })).toThrow();
    expect(enrollmentJourneyDefinitionKey({})).toBe("family-enrollment");
  });
  it("materializes the approved form snapshot in the existing JourneyRequirement", () => {
    const rows = materializeJourneyRequirements("journey", { requirements: [
      { key: "form", title: "Enrollment form", blocking: true, owner: "family", enrollmentForm: form },
    ] });
    expect(rows).toEqual([{ journeyId: "journey", key: "form", title: "Enrollment form",
      blocking: true, status: "needs_you", metadata: { enrollmentForm: form } }]);
    expect(rows[0]?.metadata?.enrollmentForm).not.toBe(form);
  });
  it("rejects malformed configuration instead of dropping the signature requirement", () => {
    expect(() => materializeJourneyRequirements("journey", { requirements: [
      { key: "form", title: "Enrollment form", enrollmentForm: { ...form, consent: "" } },
    ] })).toThrow();
    expect(() => enrollmentFormSchema.parse({ ...form, fields: [form.fields[0], form.fields[0]] })).toThrow("unique");
  });
  it("normalizes text while retaining an explicit No answer", () => {
    expect(validateEnrollmentFormAnswers(form, { contact: "  After school  ", permission: false }))
      .toEqual({ contact: "After school", permission: false });
  });
  it.each([
    [{ contact: " ", permission: true }, "Complete Preferred contact"],
    [{ contact: "Email" }, "Complete School contact"],
    [{ contact: "Email", permission: "yes" }, "Choose Yes or No"],
    [{ contact: false, permission: true }, "Enter text"],
    [{ contact: "Email", permission: true, injected: "not a form field" }, "not in this enrollment form"],
  ])("rejects missing, mistyped or unconfigured answers %#", (answers, message) => {
    expect(() => validateEnrollmentFormAnswers(form, answers)).toThrow(message);
  });
  it("does not invent a form for a normal document or checklist requirement", () => {
    expect(enrollmentFormState({}, [])).toBeNull();
  });
  it("fails explicitly for corrupt configured signatures", () => {
    expect(() => enrollmentFormState({ enrollmentForm: form }, [{ kind: "enrollment_form_submission" }])).toThrow();
  });
});
describe("reviewed enrollment signature presentation", () => {
  it("renders exact configured instructions and requires signature and affirmative consent", () => {
    const html = renderToStaticMarkup(<GuardianEnrollmentForm applicationId="application" requirementId="requirement"
      record={record} closed={false} onChanged={async () => {}} />);
    expect(html).toContain(form.instructions);
    expect(html).toContain(form.consent);
    expect(html).toContain("Typed full name (electronic signature)");
    expect(html).toMatch(/type="checkbox" required=""/);
    expect(html).toContain("A registrar must review this form");
    expect(html).toMatch(/type="submit" disabled=""/);
    expect(html).toMatch(/<fieldset disabled=""/);
    expect(html).not.toContain("Upload");
  });
  it("offers no signing form on a closed enrollment checklist", () => {
    const html = renderToStaticMarkup(<GuardianEnrollmentForm applicationId="application" requirementId="requirement"
      record={record} closed={true} onChanged={async () => {}} />);
    expect(html).not.toContain("<form");
    expect(html).toContain(form.consent);
  });
  it("does not give registrars a waiver or approve button before signature", () => {
    const html = renderToStaticMarkup(<RegistrarEnrollmentFormReview applicationId="application" requirementId="requirement"
      record={record} closed={false} onChanged={async () => {}} />);
    expect(html).toContain("No checklist waiver");
    expect(html).not.toContain("<form");
  });
  it("keeps a pending signature read-only for guardians and distinguishes review from enrollment activation", () => {
    const html = renderToStaticMarkup(<GuardianEnrollmentForm applicationId="application" requirementId="requirement"
      record={submitted} closed={false} onChanged={async () => {}} />);
    expect(html).toContain("Signed - awaiting registrar review");
    expect(html).toContain("Managing Guardian");
    expect(html).toContain(">No</dd>");
    expect(html).not.toContain("<form");
  });
  it("requires a confirmed family-visible registrar decision for the signed submission", () => {
    const html = renderToStaticMarkup(<RegistrarEnrollmentFormReview applicationId="application" requirementId="requirement"
      record={submitted} closed={false} onChanged={async () => {}} />);
    expect(html).toContain("Approve signed form");
    expect(html).toContain("Return for correction and new signature");
    expect(html).toContain("Review reason (visible to the family)");
    expect(html).toMatch(/<fieldset disabled=""/);
    expect(html).toMatch(/type="checkbox" required=""/);
    expect(html).toMatch(/type="submit" disabled=""/);
  });
  it("requires a fresh signature when a form is returned for correction", () => {
    const html = renderToStaticMarkup(<GuardianEnrollmentForm applicationId="application" requirementId="requirement"
      record={{ ...submitted, review: { kind: "enrollment_form_review", submissionId: submitted.submission!.id,
        status: "rejected", reason: "Correct the contact information.", reviewerPersonId: "a1000000-0000-4000-8000-000000000003",
        reviewedAt: "2030-01-02T00:00:00.000Z" } }} closed={false} onChanged={async () => {}} />);
    expect(html).toContain("Correct the contact information");
    expect(html).toContain("Sign and resubmit corrected form");
    expect(html).toContain('autoComplete="name" class=');
    expect(html).toMatch(/value=""/);
  });
});

import { readFileSync, readdirSync } from "node:fs";
import { ActionFooter } from "@/components/workspace/action-footer";
import { Button } from "@/components/ui/button";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { FamilyInvitationForm } from "@/components/admissions/FamilyInvitationForm";
import { ClassSupplementForm } from "@/components/learning/ClassSupplementForm";
import { ExtendedSeasonDraftForm } from "@/components/operations/ExtendedSeasonDraftForm";
import { NativeClassScheduleForm } from "@/components/learning/NativeClassScheduleForm";

describe("V6.1 cross-feature form composition", () => {
  it("requires shared submit actions across all named feature forms", () => {
    const formPaths: URL[] = [];
    function scan(directory: URL) {
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const url = new URL(entry.name + (entry.isDirectory() ? "/" : ""), directory);
        if (entry.isDirectory()) scan(url);
        else if (entry.isFile() && entry.name.endsWith("Form.tsx")) formPaths.push(url);
      }
    }
    scan(new URL("../../src/components/", import.meta.url));
    expect(formPaths.length).toBeGreaterThan(10);
    for (const file of formPaths) {
      const source = readFileSync(file, "utf8");
      if (!source.includes("<form") || !source.includes('type="submit"')) continue;
      expect(
        source.includes("<ActionFooter") || source.includes("<FormActions"),
        `Missing V6.1 submit pattern in ${file.pathname}`,
      ).toBe(true);
    }
  });

  it("renders the shared step footer with appropriate spacing and labeled workflow actions", () => {
    const html = renderToStaticMarkup(<ActionFooter layout="step">
      <Button type="button" variant="outline">Previous step</Button>
      <div><Button type="button">Save and continue</Button></div>
    </ActionFooter>);
    expect(html).toContain('data-action-footer="step"');
    expect(html).toContain("justify-between");
    expect(html).toContain("border-t");
    expect(html).toContain("border-border/60");
    expect(html).toContain("pt-5");
    expect(html).toContain("Previous step");
    expect(html).toContain("Save and continue");
  });

  it.each([
    "src/components/launch-studio/EstablishSiteProfileUnified.tsx",
    "src/components/launch-studio/EstablishSiteInformationV61.tsx",
    "src/components/launch-studio/EstablishProgramsAudiencesV61.tsx",
    "src/components/launch-studio/MarketingPackageWizardV61.tsx",
  ])("shares the canonical step footer in %s", filePath => {
    const source = readFileSync(new URL(`../../${filePath}`, import.meta.url), "utf8");
    expect(source).toContain('<ActionFooter layout="step">');
    expect(source).not.toContain('layout="inline" className="justify-between border-t');
  });

  it.each([
    "src/routes/messages.tsx",
    "src/routes/operations.family-alerts.tsx",
    "src/routes/operations.curriculum.tsx",
    "src/routes/guardian.enrichment.tsx",
    "src/routes/operations.field-trips.tsx",
    "src/routes/guardian.health.tsx",
    "src/routes/platform.tsx",
  ])("preserves canonical submit actions in migrated routes: %s", filePath => {
    const source = readFileSync(new URL(`../../${filePath}`, import.meta.url), "utf8");
    expect(source).toContain("<ActionFooter");
    expect(source).toContain('type="submit"');
    expect(source).not.toMatch(/<button\b/);
  });

  it("avoids custom Field Trip input labels and style overrides", () => {
    const source = readFileSync(
      new URL("../../src/routes/operations.field-trips.tsx", import.meta.url), "utf8",
    );
    expect(source).toContain('<Field label="Trip title" required>');
    expect(source).toContain('<Field label="Destination" required>');
    expect(source).toContain('label="School-approved guardian permission statement"');
    expect(source).toContain('label="Invite an enrolled student"');
    expect(source).not.toMatch(/<Label\b/);
    expect(source).not.toContain('className="mt-1 block w-full  border bg-background p-2"');
  });

  it("keeps classroom location labels and controls on the shared Field contract", () => {
    const source = readFileSync(
      new URL("../../src/components/operations/SchoolRoomsSetup.tsx", import.meta.url), "utf8",
    );
    expect(source).toContain('<Field className="min-w-48 flex-1"');
    expect(source).not.toContain('className="mt-1 block w-full  border bg-background p-2"');
    expect(source).not.toContain("<Label>");
    expect((source.match(/<ActionFooter/g) ?? []).length).toBe(3);
  });

  it("keeps Launch draft saves on canonical Button pending presentation", () => {
    const source = readFileSync(
      new URL("../../src/components/launch-studio/LaunchDraftButton.tsx", import.meta.url), "utf8",
    );
    expect(source).toContain('loading={mutation.pending}');
    expect(source).toContain('loadingLabel="Saving draft..."');
    expect(source).not.toContain('mutation.pending ? "Saving draft..." : buttonLabel');
  });

  it("connects Class schedule labels, control identities and the shared submit footer", () => {
    const html = renderToStaticMarkup(<NativeClassScheduleForm
      classId="class-1" siteTimeZone="America/Los_Angeles"
      mode="single" first="2026-11-24T15:30" minutes={60}
      customRows={[]} busy={false} scheduled={false}
      onModeChange={() => undefined} onFirstChange={() => undefined}
      onMinutesChange={() => undefined} onRowChange={() => undefined}
      onRemoveRow={() => undefined} onAddRow={() => undefined}
      onSubmit={() => undefined}/>);
    expect(html).toContain('data-action-footer="inline"');
    expect(html).toContain('for="native-series-start"');
    expect(html).toContain('id="native-series-start"');
    expect(html).toContain('for="native-series-duration"');
    expect(html).toContain('id="native-series-duration"');
    expect(html).toContain("Schedule one Session");
  });

  it("uses the canonical panel and form actions for eligible family invitations", () => {
    const html = renderToStaticMarkup(<FamilyInvitationForm
      programs={[{ id: "program-1", name: "Weekend learning" }]}
      draft={{ programId: "program-1", contacts: "", subject: "", introduction: "" }}
      busy={false} onChange={() => undefined} onSubmit={() => undefined} />);
    expect(html).toContain('aria-label="Send a private receiving-school application invitation"');
    expect(html).toContain('data-action-footer="form"');
    expect(html).toContain('type="submit"');
    expect(html).toContain("Queue secure invitations");
    expect(html).not.toMatch(/rounded-(?:lg|xl|full)/);
  });

  it("keeps the invitation submit control inert and visibly busy while sending", () => {
    const html = renderToStaticMarkup(<FamilyInvitationForm
      programs={[{ id: "program-1", name: "Weekend learning" }]}
      draft={{ programId: "program-1", contacts: "", subject: "", introduction: "" }}
      busy onChange={() => undefined} onSubmit={() => undefined} />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Queuing invitations...");
    expect(html).toContain("disabled");
    expect(html).toContain('data-action-footer="form"');
  });

  it("shows the shared empty state without creating an unauthorized invitation form", () => {
    const html = renderToStaticMarkup(<FamilyInvitationForm
      programs={[]}
      draft={{ programId: "", contacts: "", subject: "", introduction: "" }}
      busy={false} onChange={() => undefined} onSubmit={() => undefined} />);
    expect(html).toContain("No eligible Programs");
    expect(html).toContain('data-empty-kind="records"');
    expect(html).not.toContain("<form");
  });

  it("uses a shared panel and actions for the existing class-resource editor", () => {
    const html = renderToStaticMarkup(<ClassSupplementForm
      title="Reading guide" url="https://example.org/guide" kind="link"
      lessonId="" lessons={[]} busy={false}
      onTitleChange={() => undefined} onUrlChange={() => undefined}
      onKindChange={() => undefined} onLessonChange={() => undefined}
      onSubmit={() => undefined} />);
    expect(html).toContain('aria-label="Add class or lesson resource"');
    expect(html).toContain('data-action-footer="inline"');
    expect(html).toContain('type="submit"');
    expect(html).toContain("Add resource");
  });

  it("preserves the extended-season draft form while standardizing its action row", () => {
    const html = renderToStaticMarkup(<ExtendedSeasonDraftForm
      value={{ programId: "", offeringName: "", seasonName: "", activityType: "arts",
        startsOn: "", endsOn: "", capacity: 20 }}
      selectable={[]} busy={false} attempted={false}
      onChange={() => undefined} onSubmit={() => undefined} />);
    expect(html).toContain('data-action-footer="inline"');
    expect(html).toContain('type="submit"');
    expect(html).toContain("Save draft season");
    expect(html).toContain("Create a hosted noncredit summer or after-school Program");
  });

  it.each([
    "src/components/learning/ClassVideoUploadForm.tsx",
    "src/components/launch-studio/ProgramDiscoveryPanel.tsx",
    "src/components/launch-studio/PrepareOperationsV61.tsx",
  ])("uses the canonical WorkspaceNotice for important feature states in %s", filePath => {
    const source = readFileSync(new URL(`../../${filePath}`, import.meta.url), "utf8");
    expect(source).toContain("<WorkspaceNotice");
    expect(source).toMatch(/tone="(?:danger|attention|info)"/);
  });

  it.each([
    "src/components/learning/ClassVideoUploadForm.tsx",
    "src/components/learning/ClassSupplementForm.tsx",
    "src/components/operations/ExtendedSeasonDraftForm.tsx",
    "src/components/admissions/FamilyInvitationForm.tsx",
    "src/components/admissions/AdmissionsInquiryForm.tsx",
    "src/components/enrollment/EnrollmentForm.tsx",
    "src/routes/operations.interest-events.tsx",
    "src/components/operations/LaunchConfigurationForm.tsx",
    "src/components/learning/ClassCreationRequestForm.tsx",
    "src/components/learning/TeacherStudentGoalForm.tsx",
    "src/components/admissions/AdmissionsGuardianActions.tsx",
    "src/components/operations/SchoolRoomsSetup.tsx",
    "src/components/launch-studio/EstablishSiteProfileUnified.tsx",
    "src/components/launch-studio/PrepareOperationsV61.tsx",
    "src/components/launch-studio/NativeOfferingAdoptionReviewPanel.tsx",
    "src/components/launch-studio/ProgramDiscoveryPanel.tsx",
  ])("guards canonical form-action reuse in %s", filePath => {
    const source = readFileSync(new URL(`../../${filePath}`, import.meta.url), "utf8");
    expect(source).toContain("<ActionFooter");
    expect(source).toContain('type="submit"');
    expect(source).not.toMatch(/<button\b/);
  });
});

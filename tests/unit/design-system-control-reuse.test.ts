import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const files = [
  "src/components/learning/ClassCreationRequestForm.tsx",
  "src/components/workspace/site-program-fields.tsx",
  "src/components/workspace/local-datetime-field.tsx",
  "src/components/evidence/FileSelectionField.tsx",
  "src/components/evidence/EvidencePicker.tsx",
  "src/components/workspace/empty-state.tsx",
  "src/components/workflow/WorkflowPrerequisites.tsx",
  "src/components/learning/GradebookSectionSelector.tsx",
  "src/components/shell/WorkspaceContextSwitcher.tsx",
  "src/components/launch-studio/LaunchStudioShell.tsx",
  "src/components/launch-studio/EstablishSiteProfileUnified.tsx",
  "src/components/launch-studio/LaunchSiteFrameV61.tsx",
  "src/components/launch-studio/LaunchStudioOverviewV61.tsx",
  "src/components/launch-studio/LaunchFieldHelp.tsx",
  "src/components/launch-studio/LaunchDraftButton.tsx",
  "src/components/launch-studio/WebsiteTemplateGallery.tsx",
  "src/components/operations/LaunchWebsiteStep.tsx",
  "src/components/operations/LaunchWebsiteEditorHandoff.tsx",
  "src/components/operations/LaunchSchoolModelPicker.tsx",
  "src/components/operations/LaunchDeliveryModelFields.tsx",
  "src/components/operations/LaunchProgramIdentityFields.tsx",
  "src/components/operations/SchoolPreparationNavigation.tsx",
  "src/components/operations/LaunchCreatedHandoff.tsx",
  "src/components/operations/LaunchPortfolio.tsx",
  "src/components/operations/LaunchAcademicYearStep.tsx",
  "src/components/operations/LaunchOpeningTask.tsx",
  "src/components/operations/SectionFacilitatorPanel.tsx",
  "src/components/operations/LocalSiteDelegationPanel.tsx",
  "src/components/operations/SiteStaffingFeedback.tsx",
  "src/components/operations/OutboxHealthPanel.tsx",
  "src/components/operations/SchoolOpeningReviewPanel.tsx",
  "src/components/learning/SectionGradeFinalization.tsx",
  "src/components/communication/NotificationFeed.tsx",
  "src/components/communication/DeliveryHistory.tsx",
  "src/components/communication/DeliveryReceiptFacts.tsx",
  "src/components/enrollment/NoncreditDeliveryRecoveryPanel.tsx",
  "src/components/operations/SchoolFamilyDeliveryRecoveryPanel.tsx",
  "src/components/field-trips/FieldTripFacts.tsx",
  "src/components/church/ChurchApplicationConfirmation.tsx",
  "src/components/enrollment/FirstSchoolDayHandoff.tsx",
  "src/routes/enrichment.tsx",
  "src/components/operations/LaunchOrientationTask.tsx",
  "src/components/operations/LaunchTeacherQualificationPolicy.tsx",
  "src/components/operations/LaunchTaskDestination.tsx",
  "src/components/operations/OneHourSchoolLaunch.tsx",
  "src/components/operations/SchoolRoomsSetup.tsx",
  "src/routes/launch.family.tsx",
  "src/routes/launch.staff.tsx",
  "src/routes/launch.student.tsx",
  "src/routes/site-website.tsx",
];
describe("migrated workflow control reuse", () => {
  const eslint = new ESLint();
  it.each(files)("rejects route-local native controls in %s", async filePath => {
    const [result] = await eslint.lintText(
      "export function Example(){return <label>Reason<input/><select/><textarea/><button>Save</button></label>}",
      { filePath },
    );
    expect(result.messages.filter(message => message.ruleId === "no-restricted-syntax")).toHaveLength(5);
  });
  it("accepts canonical controls", async () => {
    const [result] = await eslint.lintText(
      'import { Button } from "@/components/ui/button"; export function Example(){return <Button>Save</Button>}',
      { filePath: files[0] },
    );
    expect(result.errorCount).toBe(0);
  });
});

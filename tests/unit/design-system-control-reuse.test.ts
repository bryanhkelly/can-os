import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

/**
 * Enforcement is directory-wide rather than an ever-growing manifest of
 * feature filenames. Every current and future feature gets the same contract.
 */
const featureSurfaces = [
  "src/routes/launch.site.tsx",
  "src/routes/class.tsx",
  "src/components/learning/ClassCreationRequestForm.tsx",
  "src/components/operations/LaunchWizardPage.tsx",
  "src/components/launch-studio/EstablishSiteProfileUnified.tsx",
  "src/components/admissions/AdmissionsInquiryForm.tsx",
  "src/components/shell/WorkspaceSidebar.tsx",
  "src/components/workspace/form-page.tsx",
  "src/components/workflow/guided-setup-shell.tsx",
  "src/components/evidence/EvidencePicker.tsx",
] as const;

const eslint = new ESLint();
const ownershipErrors = (messages: readonly { ruleId: string | null }[]) =>
  messages.filter(message => message.ruleId === "can-os-design/no-native-feature-controls");

describe("V6.1 global native-control ownership", () => {
  it.each(featureSurfaces)("rejects custom native controls in %s", async filePath => {
    const [result] = await eslint.lintText(
      "export function Example(){return <><button>Save</button><input/><select/><textarea/><label>Reason</label></>}",
      { filePath },
    );
    expect(ownershipErrors(result.messages)).toHaveLength(5);
  });

  it("permits canonical component composition in every feature", async () => {
    const [result] = await eslint.lintText(
      'import { Button } from "@/components/ui/button"; export function Example(){return <Button>Save</Button>}',
      { filePath: featureSurfaces[0] },
    );
    expect(ownershipErrors(result.messages)).toHaveLength(0);
  });

  it("keeps intentional hidden form fields and choice-card labels", async () => {
    const [result] = await eslint.lintText(
      'export function Example(){return <><input type="hidden" name="token"/><label><Checkbox name="consent"/>Agree</label><label><Radio name="answer"/>Yes</label></>}',
      { filePath: featureSurfaces[0] },
    );
    expect(ownershipErrors(result.messages)).toHaveLength(0);
  });

  it("enforces canonical submit rows in migrated modules", async () => {
    const [result] = await eslint.lintText(
      'export function Example(){return <form><div className="flex gap-2"><Button type="submit">Save</Button></div></form>}',
      { filePath: "src/components/admissions/FamilyInvitationForm.tsx" },
    );
    const matched = result.messages.filter(message => message.ruleId === "can-os-design/no-duplicate-form-actions");
    expect(matched).toHaveLength(1);
    expect(matched[0]?.severity).toBe(2);
  });

  it("reports unmigrated submit rows as actionable warnings", async () => {
    const [result] = await eslint.lintText(
      'export function Example(){return <form><footer><Button type="submit">Save</Button></footer></form>}',
      { filePath: "src/components/learning/LearningQuestionnaire.tsx" },
    );
    const matched = result.messages.filter(message => message.ruleId === "can-os-design/no-duplicate-form-actions");
    expect(matched).toHaveLength(1);
    expect(matched[0]?.severity).toBe(1);
  });

  it("allows native HTML only inside canonical UI primitive implementations", async () => {
    const [primitive] = await eslint.lintText(
      'export function Example(){return <button type="button">Save</button>}',
      { filePath: "src/components/ui/button.tsx" },
    );
    const [feature] = await eslint.lintText(
      'export function Example(){return <button type="button">Save</button>}',
      { filePath: "src/components/learning/ClassCreationRequestForm.tsx" },
    );
    expect(ownershipErrors(primitive.messages)).toHaveLength(0);
    expect(ownershipErrors(feature.messages)).toHaveLength(1);
  });
});

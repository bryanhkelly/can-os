import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import storybook from "eslint-plugin-storybook";
import canOsDesign from "./scripts/eslint-plugin-can-os-design.mjs";

// Legacy application violations remain visible as warnings during incremental
// adoption. New shared design primitives enforce semantic colors as errors.
const asWarnings = rules => Object.fromEntries(Object.keys(rules ?? {}).map(rule => [rule, "warn"]));
const inheritedWarnings = {
  ...asWarnings(js.configs.recommended.rules),
  ...Object.assign({}, ...tseslint.configs.recommended.map(config => asWarnings(config.rules))),
  ...asWarnings(reactHooks.configs.recommended.rules),
};

export default tseslint.config(
  { ignores: ["node_modules", "dist", "storybook-static", "src/routeTree.gen.ts", "playwright-report", "test-results"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx,mjs}"],
    plugins: { "react-hooks": reactHooks, "can-os-design": canOsDesign },
    rules: {
      ...reactHooks.configs.recommended.rules,
      ...inheritedWarnings,
      "no-undef": "off",
      "no-unused-vars": "off",
      "@typescript-eslint/no-unused-vars": ["warn", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "no-duplicate-imports": "warn",
      "can-os-design/no-hardcoded-colors": "warn",
    },
  },
  {
    files: ["src/components/{ui,workspace,workflow}/**/*.tsx", "src/routes/guardian.apply.tsx"],
    rules: { "can-os-design/no-hardcoded-colors": "error" },
  },
  {
    files: [
      "src/components/learning/ClassCreationRequestForm.tsx",
      "src/components/workspace/{site-program-fields,local-datetime-field}.tsx",
      "src/components/evidence/FileSelectionField.tsx",
      "src/components/shell/WorkspaceContextSwitcher.tsx",
      "src/components/shell/{CommandPalette,WorkspaceSearchDialog}.tsx",
      "src/components/operations/{OpeningHandoffs,ObsoleteExcuseClosure,SectionLifecycleManager}.tsx",
      "src/components/admissions/AdmissionsInquiryForm.tsx",
      "src/components/teacher/TeacherConferencePanel.tsx",
      "src/components/student/LiveSchoolExperiences.tsx",
      "src/components/learning/GradebookAssessmentComposer.tsx",
      "src/components/operations/SchoolYearCard.tsx",
      "src/components/operations/SchoolYearScheduleSetup.tsx",
      "src/components/operations/SchoolYearScheduleEditor.tsx",
      "src/components/operations/LaunchRequirementActions.tsx",
      "src/components/operations/LaunchHostAndProviderFields.tsx",
      "src/components/operations/LaunchConfigurationForm.tsx",
      "src/components/operations/LaunchWizardPage.tsx",
      "src/components/operations/LaunchAcademicSetupWorkspace.tsx",
      "src/components/profiles/{TeacherPolicyRevisions,QualificationCatalog}.tsx",
      "src/components/workspace/{query-state,directory-table}.tsx",
      "src/routes/staff.teachers.tsx",
      "src/routes/operations.teacher-marketplace.tsx",
      "src/routes/operations.jurisdiction-profiles.tsx",
      "src/routes/guardian.admission-offers.tsx",
    ],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "JSXOpeningElement[name.name=/^(button|input|select|textarea|label)$/]",
        message: "Use the canonical Button, Input, Select, Textarea, or Label primitive.",
      }],
    },
  },
  ...storybook.configs["flat/recommended"],
);

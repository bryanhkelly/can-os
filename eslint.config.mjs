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
  { ignores: ["node_modules", "dist", ".netlify", "storybook-static", "src/routeTree.gen.ts", "playwright-report", "test-results"] },
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
  // All production pages and feature components must use semantic V6.1
  // colors, not arbitrary Tailwind palette shades. Stories and tests remain
  // diagnostic rather than production UI.
  {
    files: ["src/**/*.tsx"],
    ignores: ["src/**/*.stories.tsx", "src/**/*.test.tsx", "src/**/*.spec.tsx"],
    rules: { "can-os-design/no-hardcoded-colors": "error" },
  },
  // Layout and type contract (docs/design-system-v6-1.md): pages align to the shell grid
  // through the shared primitives, and type sizes/letter-spacing come from tokens.
  {
    files: ["src/**/*.tsx"],
    rules: {
      "can-os-design/no-raw-page-structure": "error",
      "can-os-design/no-arbitrary-type-values": "error",
      "can-os-design/no-brand-prefixed-labels": "error",
      "can-os-design/section-tabs-only": "error",
      "can-os-design/no-repeated-primary": "error",
    },
  },
  {
    files: ["src/**/*.{ts,tsx}"],
    ignores: ["src/**/*.test.{ts,tsx}"],
    rules: { "can-os-design/no-parenthetical-plurals": "error" },
  },
  {
    // Primitives that own <main>/<h1>, public signed-out pages, and design-system specimens.
    files: [
      "src/components/workspace/{page-frame,dashboard-home}.tsx",
      "src/components/student/StudentExperience.tsx",
      "src/components/learning/ClassroomWorkspace.tsx",
      "src/router.tsx",
      "src/routes/site.new.tsx",
      "src/**/*.stories.tsx",
    ],
    rules: { "can-os-design/no-raw-page-structure": "off" },
  },
  {
    files: [
      "src/components/learning/ClassCreationRequestForm.tsx",
      "src/components/workspace/{site-program-fields,local-datetime-field}.tsx",
      "src/components/evidence/FileSelectionField.tsx",
      "src/components/evidence/EvidencePicker.tsx",
      "src/components/learning/GradebookSectionSelector.tsx",
      "src/components/operations/{SectionFacilitatorPanel,LocalSiteDelegationPanel,SiteStaffingFeedback}.tsx",
      "src/components/operations/OutboxHealthPanel.tsx",
      "src/components/operations/SchoolOpeningReviewPanel.tsx",
      "src/components/learning/SectionGradeFinalization.tsx",
      "src/components/communication/{NotificationFeed,DeliveryHistory,DeliveryReceiptFacts}.tsx",
      "src/components/enrollment/NoncreditDeliveryRecoveryPanel.tsx",
      "src/components/operations/SchoolFamilyDeliveryRecoveryPanel.tsx",
      "src/components/workflow/recorded-time.tsx",
      "src/components/field-trips/FieldTripFacts.tsx",
      "src/components/church/ChurchApplicationConfirmation.tsx",
      "src/components/enrollment/FirstSchoolDayHandoff.tsx",
      "src/routes/enrichment.tsx",
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
      "src/components/operations/{SchoolPreparationNavigation,LaunchCreatedHandoff,LaunchPortfolio}.tsx",
      "src/components/operations/{LaunchAcademicYearStep,LaunchOpeningTask,LaunchOrientationTask,LaunchTeacherQualificationPolicy,LaunchTaskDestination,OneHourSchoolLaunch,SchoolRoomsSetup}.tsx",
      // Launch Studio is migrated to canonical UI controls, not route-local native widgets.
      "src/components/launch-studio/{LaunchStudioShell,LaunchSiteFrameV61,LaunchStudioOverviewV61,EstablishSiteProfileUnified,LaunchFieldHelp,LaunchDraftButton,WebsiteTemplateGallery}.tsx",
      "src/components/operations/{LaunchWebsiteStep,LaunchWebsiteEditorHandoff,LaunchSchoolModelPicker,LaunchDeliveryModelFields,LaunchProgramIdentityFields}.tsx",
      "src/routes/launch.{family,staff,student}.tsx",
      "src/routes/site-website.tsx",
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
  // The current V6.1 Launch Studio journey is fully migrated. Prevent it
  // from regressing to custom native controls or role-specific palette classes.
  // Wrapped <label> remains valid for full-card checkbox/radio hit targets.
  {
    files: [
      "src/components/launch-studio/{LaunchSiteFrameV61,LaunchStudioOverviewV61,EstablishSiteProfileUnified,EstablishSiteInformationV61,EstablishProgramsAudiencesV61}.tsx",
      "src/components/launch-studio/{MarketingPackagesV61,MarketingMaterialPreviewV61,LaunchPreviewSharing,LaunchPrepareV61,LaunchSitePublicationPanel,LaunchModuleDestinationV61,LaunchReadinessPanelV61,LaunchNavigationGuardProvider}.tsx",
      "src/components/launch-studio/{SolutionCatalogV61,ProgramDiscoveryPanel,WebsiteTemplateGallery,WebsiteVisualIdentityStep,WebsiteArtworkField,WebsiteCopyField}.tsx",
      "src/components/launch-studio/{CanonicalBlueprintWorkspace,BlueprintOfferingAdoptionPicker,BlueprintReferenceCatalogPanel,BlueprintReviewHistoryPanel}.tsx",
      "src/components/launch-studio/{NativeAdoptionEvidenceChecklist,NativeOfferingAdoptionReviewPanel,SiteContentChannelEditor,SchoolBrandPreview}.tsx",
      "src/routes/{launch.site,site-website}.tsx",
    ],
    rules: {
      "can-os-design/no-hardcoded-colors": "error",
      "no-restricted-syntax": ["error", {
        selector: "JSXOpeningElement[name.name=/^(button|input|select|textarea)$/]",
        message: "Use shared V6.1 Button, Input, Select, or Textarea components.",
      }],
    },
  },
  // Shared workspace, workflow and evidence families must use canonical controls.
  {
    files: ["src/components/{workspace,workflow,evidence}/**/*.tsx"],
    ignores: ["src/components/{workspace,workflow,evidence}/**/*.stories.tsx", "src/components/{workspace,workflow,evidence}/**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": ["error", {
        selector: "JSXOpeningElement[name.name=/^(button|input|select|textarea|label)$/]",
        message: "Shared components must use V6.1 Button, Field, Input, Select or Textarea.",
      }],
    },
  },
  ...storybook.configs["flat/recommended"],
);

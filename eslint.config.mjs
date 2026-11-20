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
  // One rule across every production UI surface. Native controls are owned
  // by the canonical primitives; hidden inputs and whole-card choice labels
  // receive explicitly tested semantic exceptions.
  {
    files: ["src/**/*.{tsx,jsx}"],
    ignores: [
      "src/components/ui/**/*.{tsx,jsx}",
      "src/**/*.stories.{tsx,jsx}",
      "src/**/*.test.{tsx,jsx}",
      "src/**/*.spec.{tsx,jsx}",
    ],
    rules: {
      "can-os-design/no-native-feature-controls": "error",
      // Existing unmatched form layouts remain visible as warnings while
      // consolidated flows are protected with a stricter scoped rule below.
      "can-os-design/no-duplicate-form-actions": "warn",
    },
  },
  {
    files: [
      "src/components/learning/{ClassVideoUploadForm,ClassSupplementForm}.tsx",
      "src/components/operations/{ExtendedSeasonDraftForm,LaunchConfigurationForm}.tsx",
      "src/components/admissions/{FamilyInvitationForm,AdmissionsInquiryForm}.tsx",
      "src/components/enrollment/EnrollmentForm.tsx",
      "src/routes/operations.interest-events.tsx",
      "src/components/launch-studio/{EstablishSiteProfileUnified,PrepareOperationsV61,NativeOfferingAdoptionReviewPanel,ProgramDiscoveryPanel}.tsx",
    ],
    rules: { "can-os-design/no-duplicate-form-actions": "error" },
  },
  ...storybook.configs["flat/recommended"],
);

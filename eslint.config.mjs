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
  ...storybook.configs["flat/recommended"],
);

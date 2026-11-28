import {fileURLToPath} from "node:url";
import {unavailableRpcAliases} from "./fixture-unavailable-rpc.mjs";

// One mock resolution contract for both interactive Storybook and Vitest.
// New fixture-only endpoints must be explicit and scoped, never a live credential.
export const storybookFixtureAliases = {
  "@/modules/programs/launch-drafts.functions":fileURLToPath(new URL("../src/modules/programs/__mocks__/launch-drafts.functions.ts",import.meta.url)),
  "@/modules/profiles/student-self-profile.functions":fileURLToPath(new URL("../src/modules/profiles/__mocks__/student-self-profile.functions.ts",import.meta.url)),
  "@/modules/profiles/qualifications.functions":fileURLToPath(new URL("../src/modules/profiles/__mocks__/qualifications.functions.ts",import.meta.url)),
  ...unavailableRpcAliases,
  "@":fileURLToPath(new URL("../src",import.meta.url)),
};

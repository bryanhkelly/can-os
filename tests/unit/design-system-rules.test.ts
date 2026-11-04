import { afterAll, describe, it } from "vitest";
import { RuleTester } from "eslint";
import plugin from "../../scripts/eslint-plugin-can-os-design.mjs";

RuleTester.afterAll = afterAll;
RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const tester = new RuleTester({
  languageOptions: { ecmaVersion: "latest", sourceType: "module", parserOptions: { ecmaFeatures: { jsx: true } } },
});

tester.run("no-raw-page-structure", plugin.rules["no-raw-page-structure"], {
  valid: [
    `const page = <WorkspaceShell title="Messages"><section /></WorkspaceShell>;`,
    `const title = <PageTitle>Messages</PageTitle>;`,
    `const heading = <h2>Section</h2>;`,
  ],
  invalid: [
    { code: `const page = <main className="mx-auto max-w-5xl" />;`, errors: [{ messageId: "structure" }] },
    { code: `const title = <h1 className="font-serif text-4xl">Messages</h1>;`, errors: [{ messageId: "structure" }] },
  ],
});

tester.run("no-arbitrary-type-values", plugin.rules["no-arbitrary-type-values"], {
  valid: [
    `const a = "text-2xs tracking-eyebrow text-section";`,
    `const b = "w-[18rem] grid-cols-[15rem_minmax(0,1fr)] text-[var(--x)]";`,
  ],
  invalid: [
    { code: `const a = "text-[0.65rem] text-muted-foreground";`, errors: [{ messageId: "token" }] },
    { code: "const b = `uppercase tracking-[0.2em]`;", errors: [{ messageId: "token" }] },
    { code: `const c = "md:text-[11px]";`, errors: [{ messageId: "token" }] },
  ],
});

tester.run("no-brand-prefixed-labels", plugin.rules["no-brand-prefixed-labels"], {
  valid: [`const a = "Admissions";`, `const b = <p>CAN OS</p>;`, `const c = "Confirm your CAN OS access";`],
  invalid: [
    { code: `const a = "CAN OS · Admissions";`, errors: [{ messageId: "brand" }] },
    { code: `const b = <p>CAN OS / Your classroom</p>;`, errors: [{ messageId: "brand" }] },
  ],
});

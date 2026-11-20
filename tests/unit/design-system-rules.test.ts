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

tester.run("no-native-feature-controls", plugin.rules["no-native-feature-controls"], {
  valid: [
    'const page = <Button type="submit">Save</Button>;',
    'const field = <Field label="Name"><Input /></Field>;',
    'const hidden = <input type="hidden" name="returnTo" value="/" />;',
    'const choice = <label><Checkbox name="consent"/> I agree</label>;',
    'const choice = <label><Radio name="selection" /> Option A</label>;',
    'const nested = <label><span><Checkbox name="consent"/></span> I agree</label>;',
  ],
  invalid: [
    { code: 'const page = <button type="button">Save</button>;', errors: [{ messageId: "primitive" }] },
    { code: 'const page = <input type="text" />;', errors: [{ messageId: "primitive" }] },
    { code: 'const page = <input type={kind} />;', errors: [{ messageId: "primitive" }] },
    { code: 'const page = <select><option>Yes</option></select>;', errors: [{ messageId: "primitive" }] },
    { code: 'const page = <textarea />;', errors: [{ messageId: "primitive" }] },
    { code: 'const page = <dialog open>Details</dialog>;', errors: [{ messageId: "primitive" }] },
    { code: 'const page = <label>Feedback</label>;', errors: [{ messageId: "primitive" }] },
    { code: 'const page = <label><Input /> Feedback</label>;', errors: [{ messageId: "primitive" }] },
    { code: 'const page = <label><Checkbox/><Input/>Choose</label>;', errors: [{ messageId: "primitive" }] },
    { code: 'const page = <label><input type="checkbox"/>Choose</label>;', errors: [{ messageId: "primitive" }, { messageId: "primitive" }] },
  ],
});

tester.run("no-duplicate-form-actions", plugin.rules["no-duplicate-form-actions"], {
  valid: [
    'const page = <form><ActionFooter><Button type="submit">Save</Button></ActionFooter></form>;',
    'const page = <form><FormActions submitLabel="Save" pending={false}/></form>;',
    'const page = <form><div className="flex gap-2"><Button type="button">Cancel</Button></div></form>;',
    'const page = <div><Button type="submit">Standalone action</Button></div>;',
    'const page = <form><div><ActionFooter><Button type="submit">Save</Button></ActionFooter></div></form>;',
  ],
  invalid: [
    { code: 'const page = <form><div className="flex gap-2"><Button type="submit">Save</Button></div></form>;', errors: [{ messageId: "reuse" }] },
    { code: 'const page = <form><footer><Button type="submit">Continue</Button></footer></form>;', errors: [{ messageId: "reuse" }] },
    { code: 'const page = <form><div><Field label="Name"><Input/></Field><Button type="submit">Save</Button></div></form>;', errors: [{ messageId: "reuse" }] },
  ],
});

tester.run("no-native-feature-tables", plugin.rules["no-native-feature-tables"], {
  valid: [
    'const view = <Table scrollLabel="Sites"><TableHeader><TableRow><TableHead scope="col">Site</TableHead></TableRow></TableHeader></Table>;',
    'const view = <div><TableRowHead>Site</TableRowHead><TableCell>3</TableCell></div>;',
  ],
  invalid: [
    { code: 'const view = <table><thead><tr><th>Site</th></tr></thead></table>;', errors: [{ messageId: "table" }] },
  ],
});

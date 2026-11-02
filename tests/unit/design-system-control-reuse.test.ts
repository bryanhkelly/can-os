import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const files = [
  "src/components/learning/ClassCreationRequestForm.tsx",
  "src/components/workspace/site-program-fields.tsx",
  "src/components/workspace/local-datetime-field.tsx",
  "src/components/evidence/FileSelectionField.tsx",
  "src/components/shell/WorkspaceContextSwitcher.tsx",
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

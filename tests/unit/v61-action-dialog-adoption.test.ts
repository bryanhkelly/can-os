import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import ts from "typescript";

const dialogConsumers = [
  "src/routes/guardian.admission-offers.tsx",
  "src/routes/operations.insights.tsx",
  "src/components/teacher/TeacherConferencePanel.tsx",
  "src/components/operations/OperationsWorkspace.tsx",
  "src/components/student/LiveSchoolExperiences.tsx",
  "src/routes/groups_.$groupId.tsx",
  "src/routes/operations.jurisdiction-profiles.tsx",
] as const;

function parsedDialogs(path: string) {
  const source = readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
  const file = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const dialogs: Array<{ attributes: string[]; nativeTags: string[] }> = [];
  function visit(node: ts.Node) {
    const opening = ts.isJsxElement(node) ? node.openingElement
      : ts.isJsxSelfClosingElement(node) ? node : null;
    if (opening?.tagName.getText(file) === "ActionDialog") {
      const attributes = opening.attributes.properties
        .filter(ts.isJsxAttribute).map(attribute => attribute.name.text);
      const nativeTags: string[] = [];
      function inside(child: ts.Node) {
        if (ts.isJsxOpeningElement(child) || ts.isJsxSelfClosingElement(child)) {
          const tag = child.tagName.getText(file);
          if (["button", "input", "select", "textarea", "label"].includes(tag)) nativeTags.push(tag);
        }
        ts.forEachChild(child, inside);
      }
      if (ts.isJsxElement(node)) node.children.forEach(inside);
      dialogs.push({ attributes, nativeTags });
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return dialogs;
}

describe("V6.1 ActionDialog consumers", () => {
  it.each(dialogConsumers)("%s uses shared pending and decision contracts", path => {
    const dialogs = parsedDialogs(path);
    expect(dialogs.length).toBeGreaterThan(0);
    for (const dialog of dialogs) {
      expect(dialog.attributes).toEqual(expect.arrayContaining([
        "title", "description", "confirmLabel", "pending", "pendingLabel",
        "onConfirm", "onClose",
      ]));
      expect(dialog.nativeTags).toEqual([]);
    }
  });
});

import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { duplicateImportBindings } from "../../scripts/lib/import-binding-conflicts.mjs";

function bindings(source: string) {
  const file = ts.createSourceFile(
    "source.ts", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS,
  );
  return duplicateImportBindings(file).map(result => result.name);
}

describe("production source import binding preflight", () => {
  it("rejects multiple imports declaring the same local identifier", () => {
    expect(bindings(
      'import { account } from "./account";\nimport { account } from "./account";',
    )).toEqual(["account"]);
    expect(bindings(
      'import { first as shared } from "./first";\nimport { other as shared } from "./other";',
    )).toEqual(["shared"]);
  });

  it("checks default, namespace, aliased and type-only import names", () => {
    expect(bindings(
      'import entry from "./first";\nimport { value as entry } from "./second";',
    )).toEqual(["entry"]);
    expect(bindings(
      'import * as entry from "./first";\nimport type { Item as entry } from "./second";',
    )).toEqual(["entry"]);
  });

  it("allows multiple imports that introduce distinct local names", () => {
    expect(bindings(
      'import { a } from "./common";\nimport { b } from "./common";\nimport { a as c } from "./other";',
    )).toEqual([]);
    expect(bindings('import "./side-effect";\nimport type { B } from "./types";'))
      .toEqual([]);
  });

  it("keeps native learner session recovery free of the identified build blocker", () => {
    const source = readFileSync(new URL(
      "../../src/modules/classes/native-class-session-recovery.functions.ts",
      import.meta.url,
    ), "utf8");
    expect(bindings(source)).toEqual([]);
    expect(source.match(/import\s*\{\s*assertUnambiguousAdultAccount\s*\}\s*from/g))
      .toHaveLength(1);
  });
});

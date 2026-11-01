import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("launch outreach privacy at school and authorization transitions", () => {
  it("remounts a preview when pre-opening interest becomes a real application", () => {
    const code=readFileSync("src/components/operations/LaunchFamilyProgress.tsx","utf8");
    expect(code).toContain("currentInvitationPurpose");
    expect(code).toContain('key={`${siteId ?? ""}:${programId ?? ""}:${currentInvitationPurpose}`}');
  });
  it("clears pasted contacts, confirmations and request identity on changing school", () => {
    const code=readFileSync("src/components/operations/FamilyInviteImporter.tsx","utf8");
    const switcher=code.slice(code.indexOf("onChange={event => {\n          const program"),code.indexOf("className=\"mt-2 block w-full",code.indexOf("onChange={event => {\n          const program")));
    expect(switcher).toContain('setRaw("");');
    expect(switcher).toContain("changed();");
    expect(code).toContain("selectedFamilyInvitationProgram(programs, programId)");
  });
});

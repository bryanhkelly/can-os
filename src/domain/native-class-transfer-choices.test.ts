import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  canNativeSelfTransferTo,
  nativeSelfTransferCreditModes,
  NATIVE_SELF_TRANSFER_CREDIT_MODES,
} from "./native-class-transfer-choices";

describe("native adult self-transfer choices", () => {
  it("has one ordered server-approved mode contract", () => {
    expect(NATIVE_SELF_TRANSFER_CREDIT_MODES).toEqual(["audit", "not_applicable"]);
  });
  it("exposes only server-supported audit and not-applicable credit modes", () => {
    expect(nativeSelfTransferCreditModes(["for_credit", "audit", "not_applicable"]))
      .toEqual(["audit", "not_applicable"]);
    expect(nativeSelfTransferCreditModes(["for_credit"])).toEqual([]);
    expect(nativeSelfTransferCreditModes(["audit"])).toEqual(["audit"]);
    expect(nativeSelfTransferCreditModes(["not_applicable"])).toEqual(["not_applicable"]);
  });

  it("requires another self-enrollable Class with a server-supported mode", () => {
    const sourceClassId = "source";
    const candidate = {
      classId: "target",
      enrollmentMethods: ["self", "approval"],
      allowedCreditModes: ["for_credit", "audit"],
    };
    expect(canNativeSelfTransferTo(sourceClassId, candidate)).toBe(true);
    expect(canNativeSelfTransferTo(sourceClassId, {
      ...candidate, classId: sourceClassId,
    })).toBe(false);
    expect(canNativeSelfTransferTo(sourceClassId, {
      ...candidate, enrollmentMethods: ["approval"],
    })).toBe(false);
    expect(canNativeSelfTransferTo(sourceClassId, {
      ...candidate, allowedCreditModes: ["for_credit"],
    })).toBe(false);
  });

  it("keeps UI destination selection and the server validator on the same policy", () => {
    const ui = readFileSync(new URL("../routes/class.tsx", import.meta.url), "utf8");
    const server = readFileSync(new URL("../modules/classes/native-class-transfers.functions.ts", import.meta.url), "utf8");
    expect(ui).toContain("canNativeSelfTransferTo(item.classId,row)");
    expect(ui).toContain("allowedTransferModes.map(m=>");
    expect(ui).not.toContain("target.allowedCreditModes.map(m=>");
    expect(server).toContain("creditMode:z.enum(NATIVE_SELF_TRANSFER_CREDIT_MODES)");
  });

  it("keeps saved Class transfers separate from failed view refreshes", () => {
    const ui = readFileSync(new URL("../routes/class.tsx", import.meta.url), "utf8");
    const card = ui.slice(
      ui.indexOf("function EnrolledClassCard("),
      ui.indexOf("/** One canonical Class entry."),
    );
    expect(card).toContain("useMutationFeedback(onChanged)");
    expect(card).toContain("const busy=mutation.pending||mutation.refreshFailed");
    expect(card).toContain("MutationFeedback state=");
    expect(card).toContain("refreshErrorMessage:");
    expect(card).toContain('outcome.status==="saved"||outcome.status==="refresh-failed"');
    expect(card).not.toContain("await onChanged()");
    const refresh = ui.slice(
      ui.indexOf("  async function refresh(){", ui.indexOf("function NativeLearnerClasses(")),
      ui.indexOf("  async function recoverExistingNativeLearning(){"),
    );
    expect(refresh.match(/throwOnError:true/g)).toHaveLength(5);
  });

  it("preserves the offered order when selecting an eligible default", () => {
    expect(nativeSelfTransferCreditModes(["not_applicable", "audit"])[0])
      .toBe("not_applicable");
    expect(nativeSelfTransferCreditModes(["for_credit", "audit"])[0])
      .toBe("audit");
  });
});

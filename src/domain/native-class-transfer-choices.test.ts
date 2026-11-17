import { describe, expect, it } from "vitest";
import {
  canNativeSelfTransferTo,
  nativeSelfTransferCreditModes,
} from "./native-class-transfer-choices";

describe("native adult self-transfer choices", () => {
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

  it("preserves the offered order when selecting an eligible default", () => {
    expect(nativeSelfTransferCreditModes(["not_applicable", "audit"])[0])
      .toBe("not_applicable");
    expect(nativeSelfTransferCreditModes(["for_credit", "audit"])[0])
      .toBe("audit");
  });
});

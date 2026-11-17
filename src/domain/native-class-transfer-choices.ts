/**
 * Class self-transfers currently issue non-credit participation only.
 * This must match native-class-transfers.functions.ts input.creditMode.
 * Credit-bearing moves require a separate academic/eligibility workflow.
 */
export type NativeSelfTransferCreditMode = "audit" | "not_applicable";

export function nativeSelfTransferCreditModes(
  offered: readonly string[],
): NativeSelfTransferCreditMode[] {
  return offered.filter(
    (value): value is NativeSelfTransferCreditMode =>
      value === "audit" || value === "not_applicable",
  );
}

export function canNativeSelfTransferTo(
  sourceClassId: string,
  destination: {
    classId: string;
    enrollmentMethods: readonly string[];
    allowedCreditModes: readonly string[];
  },
): boolean {
  return destination.classId !== sourceClassId &&
    destination.enrollmentMethods.includes("self") &&
    nativeSelfTransferCreditModes(destination.allowedCreditModes).length > 0;
}

/**
 * Class self-transfers currently issue non-credit participation only.
 * This must match native-class-transfers.functions.ts input.creditMode.
 * Credit-bearing moves require a separate academic/eligibility workflow.
 */
export const NATIVE_SELF_TRANSFER_CREDIT_MODES = ["audit", "not_applicable"] as const;
export type NativeSelfTransferCreditMode = (typeof NATIVE_SELF_TRANSFER_CREDIT_MODES)[number];

export function nativeSelfTransferCreditModes(
  offered: readonly string[],
): NativeSelfTransferCreditMode[] {
  return offered.filter(
    (value): value is NativeSelfTransferCreditMode =>
      NATIVE_SELF_TRANSFER_CREDIT_MODES.some(accepted => accepted === value),
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

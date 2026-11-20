import type {
  getNativePublicClassCatalogPage, getMyNativeClassEnrollmentHistoryPage,
} from "@/modules/classes/native-class-enrollment.functions";
import type { getMyNativeClassApprovals } from "@/modules/classes/native-class-approvals.functions";
import type { getMyNativeClassInvitations } from "@/modules/classes/native-class-invitations.functions";

/** Shared server-derived contracts for Class discovery and learner actions. */
export type Item = Awaited<ReturnType<typeof getNativePublicClassCatalogPage>>["items"][number];
export type NativeApproval = Awaited<ReturnType<typeof getMyNativeClassApprovals>>[number];
export type NativeInvitation = Awaited<ReturnType<typeof getMyNativeClassInvitations>>[number];
export type EnrolledClass = Awaited<ReturnType<typeof getMyNativeClassEnrollmentHistoryPage>>["items"][number];

export type CreditMode = "for_credit" | "audit" | "not_applicable";
export const creditName: Record<CreditMode, string> = {
  for_credit: "For credit (eligibility required)",
  audit: "Audit, no academic credit",
  not_applicable: "No academic credit",
};

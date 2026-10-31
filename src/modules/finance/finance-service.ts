import type { CommandContext } from "../../domain/command-context";
import { AuthorizationError } from "../../domain/command-context";
import type { Charge, FinanceRecord, ProviderEvent } from "./finance-domain";
import { settlement, validateCharge } from "./finance-domain";

/**
 * Finance-specific narrow persistence seam.
 * The durable implementation must lock the invoice, insert the uniquely keyed
 * event, and persist the updated projection in ONE transaction.
 */
export interface FinanceStore {
  readCanonicalObligation(id: string): Promise<{
    id: string; householdId: string; subjectType: string; subjectId: string;
    amountCents: number; currency: string;
  } | null>;
  readCanonicalApplication(id: string): Promise<{
    id: string; householdId: string; programId: string;
    institutionId: string; siteId: string | null;
  } | null>;
  readInvoice(obligationId: string): Promise<FinanceRecord | null>;
  createInvoice(charge: Charge): Promise<void>;
  /** Returns false for exact duplicate provider event, and rejects conflicting IDs. */
  postVerifiedEvent(event: ProviderEvent): Promise<FinanceRecord>;
}
export type FinanceViewer = "institution" | "site" | "guardian";
export type FinanceIdentity = {
  context: CommandContext; viewer: FinanceViewer;
  /** Guardian membership/authorization evidence, loaded from canonical identity tables. */
  authorizedHouseholdIds?: readonly string[];
};

/**
 * A scoped institution or site operator must be explicitly finance-authorized.
 * A guardian may see ONLY their own verified household; actor identity is mandatory.
 * Undefined (unrestricted) scopes fail closed instead of inheriting legacy optional-scope semantics.
 */
export function authorizeFinance(identity: FinanceIdentity, charge: Charge, action: "read" | "manage"): void {
  const { context, viewer } = identity;
  if (!context.actorPersonId) throw new AuthorizationError("finance identity");
  if (viewer === "guardian") {
    if (action !== "read" || !context.capabilities.has("finance.read.own") ||
        !identity.authorizedHouseholdIds?.includes(charge.householdId)) throw new AuthorizationError("finance guardian");
    return;
  }
  const required = action === "read" ? "finance.read" : "finance.manage";
  if (!context.capabilities.has(required)) throw new AuthorizationError(required);
  if (viewer === "institution") {
    if (!context.scope.organizationIds?.includes(charge.institutionId)) throw new AuthorizationError("finance institution scope");
  } else {
    if (!context.scope.siteIds?.includes(charge.siteId)) throw new AuthorizationError("finance site scope");
  }
}

export async function registerCanonicalInvoice(store: FinanceStore, identity: FinanceIdentity, charge: Charge): Promise<void> {
  validateCharge(charge);
  authorizeFinance(identity, charge, "manage");
  const [obligation, application] = await Promise.all([
    store.readCanonicalObligation(charge.obligationId),
    store.readCanonicalApplication(charge.enrollmentId),
  ]);
  if (!obligation || obligation.householdId !== charge.householdId ||
      obligation.amountCents !== charge.amount.cents || obligation.currency !== charge.amount.currency ||
      obligation.subjectType !== "application" || obligation.subjectId !== charge.enrollmentId) {
    throw new Error("Canonical obligation mismatch");
  }
  if (!application || application.id !== charge.enrollmentId ||
      application.householdId !== charge.householdId ||
      application.institutionId !== charge.institutionId ||
      application.siteId !== charge.siteId) throw new Error("Canonical application mismatch");
  await store.createInvoice(charge);
}

/**
 * Server-only ingestion: only the configured processor can mint verified evidence.
 * Do not expose this function through a client-supplied event JSON endpoint.
 */
export async function ingestSignedWebhook(
  store: FinanceStore, processor: FinanceProcessor, rawPayload: string, signature: string,
): Promise<FinanceRecord> {
  if (!processor.configured) throw new Error("Payment processor not configured");
  const { event, verification } = await processor.verifyWebhook(rawPayload, signature);
  if (!event.verified || verification.verifiedByAdapter !== true ||
      verification.provider !== processor.name || event.provider !== processor.name)
    throw new Error("Processor verification required");
  return store.postVerifiedEvent(event);
}

export function invoiceStatus(record: FinanceRecord, configured: boolean) {
  const totals = settlement(record);
  if (!configured) return { state: "not_configured" as const, ...totals };
  if (!record.providerPaymentId) return { state: "due" as const, ...totals };
  return { state: totals.netCents === 0 ? "refunded" as const : "paid" as const, ...totals };
}

/** Provider abstraction. No implicit test-double fallback in production. */
export interface FinanceProcessor {
  readonly name: string;
  readonly configured: boolean;
  requestPayment(input: { obligationId: string; amountCents: number; currency: "USD"; idempotencyKey: string }):
    Promise<{ kind: "unavailable"; reason: string } | { kind: "submitted"; intentId: string }>;
  verifyWebhook(rawPayload: string, signature: string):
    Promise<{ event: ProviderEvent; verification: { verifiedByAdapter: true; provider: string } }>;
}
export class NotConfiguredProcessor implements FinanceProcessor {
  readonly name = "not_configured";
  readonly configured = false;
  async requestPayment(): Promise<{ kind: "unavailable"; reason: string }> {
    return { kind: "unavailable", reason: "Payment processor not configured" };
  }
  async verifyWebhook(): Promise<never> {
    throw new Error("Payment processor not configured");
  }
}


import { and, eq, inArray, isNotNull, isNull, or } from "drizzle-orm";
import type { Database } from "@/db/client";
import { accessAccounts, accountPersonGrants, people, safeguardingSiteResponders } from "@/db/schema";

type Transaction = Parameters<Parameters<Database["transaction"]>[0]>[0];

/** Current Site appointments are routing candidates, not sufficient authority.
 * Keep their identity, grant and account live until the handoff is committed. */
export async function currentSafeguardingFallbacks(
  tx: Transaction,
  incident: { siteId: string; organizationId: string | null },
) {
  const recipientRows = await tx.select({ personId: safeguardingSiteResponders.personId,
    responsibility: safeguardingSiteResponders.responsibility,
  }).from(safeguardingSiteResponders)
    .innerJoin(people, eq(people.id, safeguardingSiteResponders.personId))
    .innerJoin(accountPersonGrants, eq(accountPersonGrants.personId, people.id))
    .innerJoin(accessAccounts, eq(accessAccounts.id, accountPersonGrants.accountId))
    .where(and(eq(safeguardingSiteResponders.siteId, incident.siteId),
      inArray(safeguardingSiteResponders.responsibility, ["deputy", "can_lead"]),
      eq(people.active, true), eq(accountPersonGrants.active, true),
      eq(accountPersonGrants.organizationId, incident.organizationId!),
      or(eq(accountPersonGrants.siteId, incident.siteId), isNull(accountPersonGrants.siteId)),
      inArray(accountPersonGrants.role, ["safeguarding_responder", "safeguarding_lead"]),
      eq(accessAccounts.disabled, false), isNotNull(accessAccounts.emailVerifiedAt)))
    .for("share", { of: [safeguardingSiteResponders, people, accountPersonGrants, accessAccounts] });
  const recipients = [...new Map(recipientRows.map(row => [row.personId+":"+row.responsibility,row])).values()];
  return recipients;
}

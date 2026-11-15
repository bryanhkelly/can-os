import { and, eq } from "drizzle-orm";
import { createServerFn } from "@tanstack/react-start";
import { getRequest, setResponseHeader } from "@tanstack/react-start/server";
import { db } from "@/db/client";
import { accessAccounts, people } from "@/db/schema";
import { AuthorizationError } from "@/domain/command-context";
import { myCanContactInput, accountProfileCanEdit } from "@/domain/can-account-profile";
import { writeAudit } from "@/platform/mutation";
import { getCommandContext } from "./command-context.server";
import { readSessionGrants } from "./session-grants.server";

/**
 * Person-owned portable contact preferences. Official legal names, student
 * records, guardianship, credentials and staff permissions never change here.
 */
export const saveMyCanContact = createServerFn({ method: "POST" })
  .validator((input: unknown) => myCanContactInput.parse(input))
  .handler(async ({ data }) => {
    setResponseHeader("Cache-Control", "private, no-store");
    const actor = await getCommandContext(getRequest());
    const accountId = actor.sessionAccountId ?? actor.accountId;
    if (!actor.actorPersonId) throw new AuthorizationError("active Person");

    const [account] = await db.select({
      email: accessAccounts.emailNormalized, verified: accessAccounts.emailVerifiedAt,
    }).from(accessAccounts).where(and(eq(accessAccounts.id, accountId),
      eq(accessAccounts.disabled, false))).limit(1);
    if (!account?.verified) throw new AuthorizationError("verified CAN account");
    const { grants, demoAccountSwitching } = await readSessionGrants(accountId, account.email);
    if (!accountProfileCanEdit({
      demoAccountSwitching, actorPersonId: actor.actorPersonId,
      activeGrantId: actor.grantId, grants,
    })) throw new AuthorizationError("single verified account Person");

    return db.transaction(async tx => {
      const [current] = await tx.select({
        id: people.id, preferredName: people.preferredName, phone: people.phone,
      }).from(people).where(and(eq(people.id, actor.actorPersonId),
        eq(people.active, true))).for("update").limit(1);
      if (!current) throw new AuthorizationError("current Person");
      const preferredName = data.preferredName || null;
      const contactPhone = data.phone || null;
      await tx.update(people).set({
        preferredName, phone: contactPhone, updatedAt: new Date(),
      }).where(eq(people.id, current.id));
      // Audit changes and attribution, not raw contact values.
      await writeAudit(tx, actor, {
        action: "account.personal_contact.updated",
        entityType: "person",
        entityId: current.id,
        before: {
          preferredNameSet: current.preferredName !== null,
          phoneSet: current.phone !== null,
        },
        after: { preferredNameSet: preferredName !== null, phoneSet: contactPhone !== null },
      });
      return { saved: true };
    });
  });

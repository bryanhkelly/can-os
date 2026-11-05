import { integer, jsonb, pgTable, text, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { id, updatedAt } from "./common";
import { accessAccounts, accountPersonGrants } from "./access";
import type { LaunchDraftValue } from "@/domain/launch-draft";

export const launchStudioDrafts = pgTable("launch_studio_drafts", {
  id: id(),
  accountId: uuid("account_id").notNull().references(() => accessAccounts.id, { onDelete: "cascade" }),
  grantId: uuid("grant_id").notNull().references(() => accountPersonGrants.id, { onDelete: "cascade" }),
  audience: text("audience").notNull(),
  context: text("context").notNull(),
  value: jsonb("value").$type<LaunchDraftValue>().notNull(),
  revision: integer("revision").notNull().default(1),
  updatedAt: updatedAt(),
}, table => [uniqueIndex("launch_studio_drafts_owner_uq").on(
  table.accountId, table.grantId, table.audience, table.context,
)]);

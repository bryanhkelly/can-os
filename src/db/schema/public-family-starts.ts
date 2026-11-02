import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./common";
import { programs, sites } from "./organizations";

/** Brief, unverified public application intent. No child identity, account,
 * Person, Household or authorization is created until the email-link owner
 * redeems a single-use token on the CAN OS platform origin.
 */
export const publicFamilyStartRequests = pgTable("public_family_start_requests", {
  id: id(),
  siteId: uuid("site_id").notNull().references(()=>sites.id,{onDelete:"restrict"}),
  programId: uuid("program_id").notNull().references(()=>programs.id,{onDelete:"restrict"}),
  emailNormalized: text("email_normalized").notNull(),
  adultFirstName: text("adult_first_name").notNull(),
  adultLastName: text("adult_last_name").notNull(),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at",{withTimezone:true}).notNull(),
  consumedAt: timestamp("consumed_at",{withTimezone:true}),
  createdAt: createdAt(),
},t=>[
  uniqueIndex("public_family_starts_token_uq").on(t.tokenHash),
  index("public_family_starts_expiry_idx").on(t.expiresAt),
  index("public_family_starts_school_idx").on(t.programId,t.createdAt),
]);

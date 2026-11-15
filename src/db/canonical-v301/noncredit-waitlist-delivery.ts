import { index, integer, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { educationV30 } from "./core";
import { noncreditEnrollmentWaitlist } from "./self-enrollment";

/** Durable, per-invitation outbound receipt. Never store recipient email,
 * access links or send from inside the enrollment transaction.
 * A second invitation after expiry gets its own immutable receipt key.
 */
export const noncreditWaitlistEmailDeliveries=educationV30.table(
  "noncredit_waitlist_email_deliveries",{
    id:uuid("id").defaultRandom().primaryKey(),
    waitlistId:uuid("waitlist_id").notNull()
      .references(()=>noncreditEnrollmentWaitlist.id),
    invitationExpiresAt:timestamp("invitation_expires_at",{withTimezone:true}).notNull(),
    status:text("status").$type<"pending"|"processing"|"accepted"|"failed"|"suppressed">()
      .notNull().default("pending"),
    attempts:integer("attempts").notNull().default(0),
    nextAttemptAt:timestamp("next_attempt_at",{withTimezone:true}),
    leaseUntil:timestamp("lease_until",{withTimezone:true}),
    acceptedAt:timestamp("accepted_at",{withTimezone:true}),
    lastError:text("last_error"),
    createdAt:timestamp("created_at",{withTimezone:true}).notNull().defaultNow(),
    updatedAt:timestamp("updated_at",{withTimezone:true}).notNull().defaultNow(),
  },t=>[
    uniqueIndex("noncredit_waitlist_email_invitation_uq")
      .on(t.waitlistId,t.invitationExpiresAt),
    index("noncredit_waitlist_email_retry_idx").on(t.status,t.nextAttemptAt),
  ],
);

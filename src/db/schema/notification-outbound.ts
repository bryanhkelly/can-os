import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { notifications } from "./work";

/** Outbound transport receipts for a canonical in-app Notification.
 * The Notification and its linked school Action remain authoritative;
 * transport acceptance never means a family opened or received the message.
 */
export const notificationOutboundDeliveries=pgTable("notification_outbound_deliveries",{
 id:id(),
 notificationId:uuid("notification_id").notNull().references(()=>notifications.id,{onDelete:"cascade"}),
 channel:text("channel").$type<"email"|"sms">().notNull(),
 status:text("status").$type<"pending"|"processing"|"accepted"|"failed"|"suppressed">().default("pending").notNull(),
 attempts:integer("attempts").default(0).notNull(),
 nextAttemptAt:timestamp("next_attempt_at",{withTimezone:true}),
 leaseUntil:timestamp("lease_until",{withTimezone:true}),
 acceptedAt:timestamp("accepted_at",{withTimezone:true}),
 lastError:text("last_error"),
 createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[
 uniqueIndex("notification_outbound_recipient_channel_uq").on(t.notificationId,t.channel),
 index("notification_outbound_status_retry_idx").on(t.status,t.nextAttemptAt),
]);

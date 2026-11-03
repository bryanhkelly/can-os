import { sql } from "drizzle-orm";
import { check, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id } from "./common";
import { sites } from "./organizations";

export const siteRooms = pgTable("site_rooms", {
  id: id(),
  siteId: uuid("site_id").notNull().references(() => sites.id, { onDelete: "restrict" }),
  name: text("name").notNull(),
  capacity: integer("capacity").notNull(),
  revision: integer("revision").notNull().default(1),
  retiredAt: timestamp("retired_at", { withTimezone: true }),
  createdAt: createdAt(),
}, table => [
  uniqueIndex("site_room_name_uq").on(table.siteId, sql`lower(btrim(${table.name}))`),
  check("site_room_name_length", sql`char_length(btrim(${table.name})) between 2 and 120`),
  check("site_room_capacity_range", sql`${table.capacity} between 1 and 1000`),
  check("site_room_revision_positive", sql`${table.revision} > 0`),
]);

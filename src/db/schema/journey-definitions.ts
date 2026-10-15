import {
  boolean,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { organizations } from "./organizations";

export const journeyDefinitions = pgTable(
  "journey_definitions",
  {
    id: id(),
    key: text("key").notNull(),
    version: text("version").notNull(),
    owningOrganizationId: uuid("owning_organization_id").references(
      () => organizations.id,
      { onDelete: "restrict" },
    ),
    audience: text("audience").notNull(),
    title: text("title").notNull(),
    active: boolean("active").default(true).notNull(),
    configuration: jsonb("configuration")
      .$type<Record<string, unknown>>()
      .default({})
      .notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("journey_definition_key_version_uq").on(table.key, table.version),
    index("journey_definition_owner_idx").on(table.owningOrganizationId),
  ],
);

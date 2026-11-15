import { text, uuid } from "drizzle-orm/pg-core";
import { educationV30 } from "./core";

/** Existing canonical Person: the Site-authorized facilitator may read only names of paired room participants. */
export const classroomPersons = educationV30.table("persons",{
  id:uuid("id").primaryKey(),
  legalFirstName:text("legal_first_name").notNull(),
  legalLastName:text("legal_last_name").notNull(),
  preferredName:text("preferred_name"),
});

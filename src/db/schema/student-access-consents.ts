import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { applications } from "./admissions";
import { people, studentProfiles } from "./identity";
import { programs, sites } from "./organizations";

/**
 * A guardian's explicit authorization to invite an admitted student to use
 * their own verified email account. An adult's email verification and
 * guardian relationship alone are NOT consent for child online access.
 * Registrar approval of identity and active classroom enrollment is separate.
 */
export const studentAccessConsents=pgTable("student_access_consents",{
 id:id(),
 applicationId:uuid("application_id").notNull().references(()=>applications.id,{onDelete:"restrict"}),
 studentProfileId:uuid("student_profile_id").notNull().references(()=>studentProfiles.id,{onDelete:"restrict"}),
 guardianPersonId:uuid("guardian_person_id").notNull().references(()=>people.id,{onDelete:"restrict"}),
 programId:uuid("program_id").notNull().references(()=>programs.id,{onDelete:"restrict"}),
 siteId:uuid("site_id").notNull().references(()=>sites.id,{onDelete:"restrict"}),
 studentEmail: text("student_email").notNull(),
 consentStatement: text("consent_statement").notNull(),
 signedAt: timestamp("signed_at",{withTimezone:true}).notNull(),
 reviewedByPersonId:uuid("reviewed_by_person_id").references(()=>people.id,{onDelete:"restrict"}),
 reviewedAt:timestamp("reviewed_at",{withTimezone:true}),
 status:text("status").notNull().default("pending_review"),
 createdAt:createdAt(),
 updatedAt:updatedAt(),
},t=>[
 uniqueIndex("student_access_consent_application_uq").on(t.applicationId),
 index("student_access_consent_reviewer_idx").on(t.programId,t.status),
]);

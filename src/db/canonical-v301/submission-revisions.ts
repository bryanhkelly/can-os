import { integer, jsonb, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
/** Typed projection of the deployed public schema. SQL owns FK, RLS and append-only triggers. */
export const gradedSubmissionRevisions=pgTable("graded_submission_revisions",{
 submissionId:uuid("submission_id").notNull(),
 courseVersionId:uuid("course_version_id").notNull(),
 revisionNo:integer("revision_no").notNull(),
 status:text("status").$type<"assigned"|"submitted"|"returned"|"graded">().notNull(),
 response:jsonb("response").notNull(),
 submittedAt:timestamp("submitted_at",{withTimezone:true}),
 recordedAt:timestamp("recorded_at",{withTimezone:true}).notNull().defaultNow(),
 source:text("source").$type<"baseline"|"insert"|"update">().notNull(),
},table=>[primaryKey({columns:[table.submissionId,table.revisionNo]})]);

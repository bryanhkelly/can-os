import {pgTable,text,timestamp,uuid,jsonb,unique} from "drizzle-orm/pg-core";
export const academicEnrollmentCutoverLinks=pgTable("academic_enrollment_cutover_links",{
 legacyEnrollmentId:uuid("legacy_enrollment_id").primaryKey(),
 classEnrollmentId:uuid("class_enrollment_id").notNull().unique(),
 provenance:text("provenance").$type<"valor_v61_recovery">().notNull(),
 recordedAt:timestamp("recorded_at",{withTimezone:true}).notNull().defaultNow(),
});
/** Typed projection. SQL owns the evidence checks, FKs, RLS and immutable triggers. */
export const historicalAcademicEvidence=pgTable("historical_academic_evidence",{
 id:uuid("id").primaryKey().defaultRandom(),
 recordKind:text("record_kind").$type<"assessment"|"submission"|"section_grade">().notNull(),
 sourceRecordId:uuid("source_record_id").notNull(),
 classId:uuid("class_id").notNull(),
 classEnrollmentId:uuid("class_enrollment_id"),
 sourceRecord:jsonb("source_record").notNull(),
 sourceSha256:text("source_sha256").notNull(),
 capturedAt:timestamp("captured_at",{withTimezone:true}).notNull().defaultNow(),
},t=>[unique().on(t.recordKind,t.sourceRecordId,t.sourceSha256)]);

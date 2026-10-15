import {index,integer,pgTable,text,timestamp,uniqueIndex,uuid} from "drizzle-orm/pg-core";
import {createdAt,id,updatedAt} from "./common";
import {applications} from "./admissions";
import {programs} from "./organizations";
import {schoolYears} from "./academic-time";
import {people} from "./identity";
/** Seat capacity is scoped to one program and one school year, not the global program. */
export const admissionSeatPools=pgTable("admission_seat_pools",{
 id:id(),programId:uuid("program_id").notNull().references(()=>programs.id,{onDelete:"restrict"}),
 schoolYearId:uuid("school_year_id").notNull().references(()=>schoolYears.id,{onDelete:"restrict"}),
 capacity:integer("capacity").notNull(),waitlistEnabled:integer("waitlist_enabled").default(0).notNull(),
 createdAt:createdAt(),updatedAt:updatedAt()
},t=>[uniqueIndex("admission_seat_pool_scope_uq").on(t.programId,t.schoolYearId)]);
export const admissionOffers=pgTable("admission_offers",{
 id:id(),applicationId:uuid("application_id").notNull().references(()=>applications.id,{onDelete:"restrict"}),
 programId:uuid("program_id").notNull().references(()=>programs.id,{onDelete:"restrict"}),
 schoolYearId:uuid("school_year_id").notNull().references(()=>schoolYears.id,{onDelete:"restrict"}),
 status:text("status").default("draft").notNull(),expiresAt:timestamp("expires_at",{withTimezone:true}),
 issuedAt:timestamp("issued_at",{withTimezone:true}),respondedAt:timestamp("responded_at",{withTimezone:true}),
 issuedByPersonId:uuid("issued_by_person_id").references(()=>people.id,{onDelete:"restrict"}),
 respondedByPersonId:uuid("responded_by_person_id").references(()=>people.id,{onDelete:"restrict"}),
 idempotencyKey:text("idempotency_key").notNull(),
 createdAt:createdAt(),updatedAt:updatedAt()
},t=>[uniqueIndex("admission_offer_idempotency_uq").on(t.idempotencyKey),index("admission_offer_pool_status_idx").on(t.programId,t.schoolYearId,t.status),index("admission_offer_application_idx").on(t.applicationId)]);

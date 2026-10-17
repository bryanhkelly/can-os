import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { studyGroupMembershipStatus, studyGroupReportStatus, studyGroupStatus } from "./enums";
import { people } from "./identity";
import { sites, programs } from "./organizations";
import { sections } from "./academics";
export const studyGroups = pgTable("study_groups", {
 id:id(), title:text("title").notNull(), description:text("description").notNull(),
 kind:text("kind").notNull(), status:studyGroupStatus("status").default("active").notNull(),
 visibility:text("visibility").default("site").notNull(),
 siteId:uuid("site_id").references(()=>sites.id,{onDelete:"restrict"}),
 programId:uuid("program_id").references(()=>programs.id,{onDelete:"restrict"}),
 sectionId:uuid("section_id").references(()=>sections.id,{onDelete:"restrict"}),
 facilitatorPersonId:uuid("facilitator_person_id").notNull().references(()=>people.id,{onDelete:"restrict"}),
 maxMembers:integer("max_members").default(20).notNull(),
 requiresApproval:boolean("requires_approval").default(true).notNull(),
 metadata:jsonb("metadata").$type<Record<string,unknown>>().default({}).notNull(),
 createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[index("study_group_site_idx").on(t.siteId),index("study_group_section_idx").on(t.sectionId)]);
export const studyGroupMemberships=pgTable("study_group_memberships",{
 id:id(),groupId:uuid("group_id").notNull().references(()=>studyGroups.id,{onDelete:"cascade"}),
 personId:uuid("person_id").notNull().references(()=>people.id,{onDelete:"restrict"}),
 role:text("role").default("student").notNull(),status:studyGroupMembershipStatus("status").default("pending").notNull(),
 reviewedByPersonId:uuid("reviewed_by_person_id").references(()=>people.id,{onDelete:"restrict"}),
 joinedAt:timestamp("joined_at",{withTimezone:true}),createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[uniqueIndex("study_group_member_uq").on(t.groupId,t.personId),index("study_group_person_idx").on(t.personId)]);
export const studyGroupSessions=pgTable("study_group_sessions",{
 id:id(),groupId:uuid("group_id").notNull().references(()=>studyGroups.id,{onDelete:"cascade"}),
 title:text("title").notNull(),agenda:text("agenda").default("").notNull(),
 startsAt:timestamp("starts_at",{withTimezone:true}).notNull(),
 endsAt:timestamp("ends_at",{withTimezone:true}).notNull(),
 location:text("location").default("").notNull(),
 createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[index("study_group_session_idx").on(t.groupId,t.startsAt)]);
export const studyGroupPosts=pgTable("study_group_posts",{
 id:id(),groupId:uuid("group_id").notNull().references(()=>studyGroups.id,{onDelete:"cascade"}),
 authorPersonId:uuid("author_person_id").notNull().references(()=>people.id,{onDelete:"restrict"}),
 body:text("body").notNull(),parentPostId:uuid("parent_post_id"),
 hidden:boolean("hidden").default(false).notNull(),createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[index("study_group_post_idx").on(t.groupId,t.createdAt)]);
export const studyGroupReports=pgTable("study_group_reports",{
 id:id(),groupId:uuid("group_id").notNull().references(()=>studyGroups.id,{onDelete:"cascade"}),
 reporterPersonId:uuid("reporter_person_id").notNull().references(()=>people.id,{onDelete:"restrict"}),
 postId:uuid("post_id").references(()=>studyGroupPosts.id,{onDelete:"set null"}),
 reason:text("reason").notNull(),status:studyGroupReportStatus("status").default("open").notNull(),
 createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[index("study_group_report_idx").on(t.groupId,t.status)]);

export const studyGroupSessionAttendance=pgTable("study_group_session_attendance",{
 id:id(),sessionId:uuid("session_id").notNull().references(()=>studyGroupSessions.id,{onDelete:"cascade"}),
 personId:uuid("person_id").notNull().references(()=>people.id,{onDelete:"restrict"}),
 rsvp:text("rsvp").notNull().default("going"),
 attended:boolean("attended"),recordedByPersonId:uuid("recorded_by_person_id").references(()=>people.id,{onDelete:"restrict"}),
 createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[uniqueIndex("study_group_session_person_uq").on(t.sessionId,t.personId)]);

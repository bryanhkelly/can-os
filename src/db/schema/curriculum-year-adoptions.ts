import {index,pgTable,text,timestamp,uniqueIndex,uuid} from "drizzle-orm/pg-core";
import {createdAt,id} from "./common";
import {organizations,programs,sites} from "./organizations";
import {schoolYears} from "./academic-time";
import {people} from "./identity";
import {curriculumPacks,curriculumPackVersions,curriculumEntitlements} from "./curriculum-marketplace";

/** Separate from legacy adoption; an annual grant never silently inherits its predecessor. */
export const curriculumAnnualAdoptions=pgTable("curriculum_annual_adoptions",{
 id:id(),
 organizationId:uuid("organization_id").notNull().references(()=>organizations.id,{onDelete:"restrict"}),
 programId:uuid("program_id").notNull().references(()=>programs.id,{onDelete:"restrict"}),
 siteId:uuid("site_id").references(()=>sites.id,{onDelete:"restrict"}),
 academicProviderOrganizationId:uuid("academic_provider_organization_id").notNull().references(()=>organizations.id,{onDelete:"restrict"}),
 academicYearId:uuid("academic_year_id").notNull().references(()=>schoolYears.id,{onDelete:"restrict"}),
 packId:uuid("pack_id").notNull().references(()=>curriculumPacks.id,{onDelete:"restrict"}),
 packVersionId:uuid("pack_version_id").notNull().references(()=>curriculumPackVersions.id,{onDelete:"restrict"}),
 entitlementId:uuid("entitlement_id").notNull().references(()=>curriculumEntitlements.id,{onDelete:"restrict"}),
 status:text("status").default("active").notNull(),
 supersededAt:timestamp("superseded_at",{withTimezone:true}),
 createdByPersonId:uuid("created_by_person_id").notNull().references(()=>people.id,{onDelete:"restrict"}),
 createdAt:createdAt(),
},t=>[
 uniqueIndex("curriculum_annual_adoption_program_year_pack_uq").on(t.programId,t.academicYearId,t.packId),
 index("curriculum_annual_adoption_org_year_idx").on(t.organizationId,t.academicYearId),
]);

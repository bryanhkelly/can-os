import { index, pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { createdAt, id, updatedAt } from "./common";
import { people } from "./identity";
import { organizations } from "./organizations";
import { transcriptIssuances } from "./report-cards";
import { diplomaIssuances } from "./graduation";

/** Release authorization is distinct from transport. No PDF or bearer link is stored. */
export const academicCredentialReleaseAuthorizations=pgTable("academic_credential_release_authorizations",{
 id:id(),
 issuingOrganizationId:uuid("issuing_organization_id").notNull().references(()=>organizations.id),
 transcriptIssuanceId:uuid("transcript_issuance_id").references(()=>transcriptIssuances.id),
 diplomaIssuanceId:uuid("diploma_issuance_id").references(()=>diplomaIssuances.id),
 recipientPersonId:uuid("recipient_person_id").notNull().references(()=>people.id),
 recipientEmail:text("recipient_email").notNull(),
 releasePurpose:text("release_purpose").notNull(),
 instructionReference:text("instruction_reference").notNull(),
 consentEvidenceReference:text("consent_evidence_reference").notNull(),
 authorizedByPersonId:uuid("authorized_by_person_id").notNull().references(()=>people.id),
 authorizedAt:timestamp("authorized_at",{withTimezone:true}).defaultNow().notNull(),
 expiresAt:timestamp("expires_at",{withTimezone:true}).notNull(),
 revokedAt:timestamp("revoked_at",{withTimezone:true}),
 createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[index("academic_release_issuer_idx").on(t.issuingOrganizationId),index("academic_release_recipient_idx").on(t.recipientPersonId)]);

/** Private, issuer-controlled delivery request and transport receipt. */
export const academicCredentialDeliveries = pgTable("academic_credential_deliveries", {
 id:id(),
 issuingOrganizationId:uuid("issuing_organization_id").notNull().references(()=>organizations.id),
 transcriptIssuanceId:uuid("transcript_issuance_id").references(()=>transcriptIssuances.id),
 diplomaIssuanceId:uuid("diploma_issuance_id").references(()=>diplomaIssuances.id),
 recipientEmail:text("recipient_email").notNull(),
 recipientName:text("recipient_name").notNull(),
 requestedByPersonId:uuid("requested_by_person_id").notNull().references(()=>people.id),
 status:text("status").$type<"pending"|"accepted"|"failed">().default("pending").notNull(),
 providerMessageId:text("provider_message_id"),
 lastError:text("last_error"),
 sentAt:timestamp("sent_at",{withTimezone:true}),
 createdAt:createdAt(),updatedAt:updatedAt(),
},t=>[index("academic_delivery_issuer_idx").on(t.issuingOrganizationId),index("academic_delivery_status_idx").on(t.status)]);

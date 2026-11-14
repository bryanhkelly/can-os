import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { educationV30, type JsonObject, type JsonValue } from "./core";

const id = () => uuid("id").defaultRandom().primaryKey();
const createdAt = () => timestamp("created_at", { withTimezone: true }).defaultNow().notNull();

export const religiousAffiliationOptions = educationV30.table("religious_affiliation_options", {
  code: text("code").primaryKey(),
  label: text("label").notNull(),
  groupCode: text("group_code").notNull(),
  parentCode: text("parent_code"),
  classification: text("classification")
    .$type<"religious" | "nonsectarian" | "unaffiliated" | "interfaith">()
    .notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  active: boolean("active").notNull().default(true),
});

export const blueprints = educationV30.table(
  "blueprints",
  {
    id: id(),
    publisherOrganizationId: uuid("publisher_organization_id").notNull(),
    code: text("code").notNull(),
    title: text("title").notNull(),
    status: text("status").$type<"active" | "retired">().notNull().default("active"),
  },
  (table) => [
    uniqueIndex("blueprints_publisher_code_uq").on(
      table.publisherOrganizationId,
      table.code,
    ),
  ],
);

export const blueprintVersions = educationV30.table(
  "blueprint_versions",
  {
    id: id(),
    blueprintId: uuid("blueprint_id").notNull(),
    versionNo: integer("version_no").notNull(),
    targetKind: text("target_kind").$type<"offering" | "operation" | "composite">().notNull(),
    spec: jsonb("spec").$type<JsonObject>().notNull().default({}),
    lifecycle: text("lifecycle").$type<"draft" | "published">().notNull().default("draft"),
    createdAt: createdAt(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("blueprint_versions_blueprint_version_uq").on(
      table.blueprintId,
      table.versionNo,
    ),
    uniqueIndex("blueprint_versions_id_blueprint_uq").on(table.id, table.blueprintId),
  ],
);

export const blueprintComponents = educationV30.table(
  "blueprint_components",
  {
    id: id(),
    blueprintVersionId: uuid("blueprint_version_id").notNull(),
    componentKey: text("component_key").notNull(),
    componentKind: text("component_kind").notNull(),
    requirementMode: text("requirement_mode")
      .$type<"required" | "optional" | "conditional">()
      .notNull()
      .default("optional"),
    componentSpec: jsonb("component_spec").$type<JsonValue>().notNull().default({}),
  },
  (table) => [
    uniqueIndex("blueprint_components_version_key_uq").on(
      table.blueprintVersionId,
      table.componentKey,
    ),
    uniqueIndex("blueprint_components_id_version_uq").on(table.id, table.blueprintVersionId),
  ],
);

export const blueprintConfigurations = educationV30.table(
  "blueprint_configurations",
  {
    id: id(),
    blueprintId: uuid("blueprint_id").notNull(),
    owningOrganizationId: uuid("owning_organization_id"),
    name: text("name").notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("blueprint_configurations_id_blueprint_uq").on(table.id, table.blueprintId),
  ],
);

export const blueprintConfigurationVersions = educationV30.table(
  "blueprint_configuration_versions",
  {
    id: id(),
    configurationId: uuid("configuration_id").notNull(),
    blueprintId: uuid("blueprint_id").notNull(),
    blueprintVersionId: uuid("blueprint_version_id").notNull(),
    revision: integer("revision").notNull(),
    config: jsonb("config").$type<JsonValue>().notNull().default({}),
    religiousAffiliationCode: text("religious_affiliation_code"),
    editorialIdentity: text("editorial_identity")
      .$type<
        | "community_belonging"
        | "academic_excellence"
        | "innovation_discovery"
        | "classical_humanities"
        | "creative_expression"
        | "leadership_service"
      >()
      .notNull()
      .default("community_belonging"),
    culturalContext: jsonb("cultural_context").$type<JsonObject>().notNull().default({}),
    lifecycle: text("lifecycle").$type<"draft" | "frozen">().notNull().default("draft"),
    createdAt: createdAt(),
    frozenAt: timestamp("frozen_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("blueprint_configuration_versions_revision_uq").on(
      table.configurationId,
      table.revision,
    ),
    uniqueIndex("blueprint_configuration_versions_id_version_uq").on(
      table.id,
      table.blueprintVersionId,
    ),
  ],
);

export const blueprintConfigurationComponents = educationV30.table(
  "blueprint_configuration_components",
  {
    configurationVersionId: uuid("configuration_version_id").notNull(),
    blueprintVersionId: uuid("blueprint_version_id").notNull(),
    componentId: uuid("component_id").notNull(),
    selectionStatus: text("selection_status")
      .$type<"selected" | "excluded" | "proposed">()
      .notNull(),
    settings: jsonb("settings").$type<JsonValue>().notNull().default({}),
  },
  (table) => [
    primaryKey({
      name: "blueprint_configuration_components_pkey",
      columns: [table.configurationVersionId, table.componentId],
    }),
  ],
);

export const blueprintConfigurationLocalExperiences = educationV30.table(
  "blueprint_configuration_local_experiences",
  {
    id: id(),
    configurationVersionId: uuid("configuration_version_id").notNull(),
    componentId: uuid("component_id").notNull(),
    experienceKind: text("experience_kind")
      .$type<"community" | "experience" | "club" | "activity">()
      .notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull().default(""),
    configuration: jsonb("configuration").$type<JsonObject>().notNull().default({}),
  },
  (table) => [
    index("blueprint_local_experiences_version_idx").on(
      table.configurationVersionId,
      table.componentId,
    ),
  ],
);

export const blueprintConfigurationOfferingIntents = educationV30.table(
  "blueprint_configuration_offering_intents",
  {
    configurationVersionId: uuid("configuration_version_id").notNull(),
    componentId: uuid("component_id").notNull(),
    offeringVersionId: uuid("offering_version_id").notNull(),
    configuration: jsonb("configuration").$type<JsonObject>().notNull().default({}),
  },
  (table) => [
    primaryKey({
      name: "blueprint_configuration_offering_intents_pkey",
      columns: [
        table.configurationVersionId,
        table.componentId,
        table.offeringVersionId,
      ],
    }),
  ],
);

export const configurationReviews = educationV30.table(
  "configuration_reviews",
  {
    id: id(),
    configurationVersionId: uuid("configuration_version_id").notNull(),
    reviewerPersonId: uuid("reviewer_person_id").notNull(),
    decision: text("decision")
      .$type<"approved" | "conditional" | "rejected" | "withdrawn">()
      .notNull(),
    evidenceVersionId: uuid("evidence_version_id"),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
    conditions: jsonb("conditions").$type<JsonValue>().notNull().default({}),
  },
  (table) => [
    uniqueIndex("configuration_reviews_id_version_uq").on(
      table.id,
      table.configurationVersionId,
    ),
  ],
);

export const blueprintComponentApprovalDecisions = educationV30.table(
  "blueprint_component_approval_decisions",
  {
    id: id(),
    configurationVersionId: uuid("configuration_version_id").notNull(),
    componentId: uuid("component_id").notNull(),
    decision: text("decision")
      .$type<"approved" | "conditional" | "denied" | "withdrawn">()
      .notNull(),
    reviewerPersonId: uuid("reviewer_person_id").notNull(),
    authorityOrganizationId: uuid("authority_organization_id").notNull(),
    evidenceVersionId: uuid("evidence_version_id"),
    decisionOrder: bigint("decision_order", { mode: "bigint" }).generatedAlwaysAsIdentity().notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }).notNull().defaultNow(),
    conditions: text("conditions"),
  },
  (table) => [
    uniqueIndex("blueprint_component_approval_decisions_order_uq").on(
      table.decisionOrder,
    ),
  ],
);

export const blueprintExecutionBatches = educationV30.table(
  "blueprint_execution_batches",
  {
    id: id(),
    configurationVersionId: uuid("configuration_version_id").notNull(),
    blueprintVersionId: uuid("blueprint_version_id").notNull(),
    reviewId: uuid("review_id").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    executionStatus: text("execution_status")
      .$type<"proposed" | "authorized" | "executed" | "suspended" | "voided">()
      .notNull()
      .default("proposed"),
    executingOrganizationId: uuid("executing_organization_id").notNull(),
    executedByPersonId: uuid("executed_by_person_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    executedAt: timestamp("executed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("blueprint_execution_batches_idempotency_uq").on(
      table.executingOrganizationId,
      table.idempotencyKey,
    ),
    uniqueIndex("blueprint_execution_batches_provenance_uq").on(
      table.id,
      table.configurationVersionId,
      table.blueprintVersionId,
      table.reviewId,
    ),
  ],
);

export const blueprintReferenceItems = educationV30.table(
  "blueprint_reference_items",
  {
    id: id(),
    code: text("code").notNull(),
    referenceKind: text("reference_kind")
      .$type<"program_model" | "community" | "experience" | "club" | "activity">()
      .notNull(),
    category: text("category").notNull(),
    status: text("status").$type<"active" | "retired">().notNull().default("active"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (table) => [
    uniqueIndex("blueprint_reference_items_code_uq").on(table.code),
    index("blueprint_reference_items_kind_category_idx").on(
      table.referenceKind,
      table.category,
      table.status,
    ),
  ],
);

export const blueprintReferenceItemVersions = educationV30.table(
  "blueprint_reference_item_versions",
  {
    id: id(),
    itemId: uuid("item_id").notNull(),
    versionNo: integer("version_no").notNull(),
    title: text("title").notNull(),
    summary: text("summary").notNull(),
    description: text("description").notNull(),
    gradeRange: jsonb("grade_range").$type<JsonObject>().notNull().default({}),
    scheduleSuggestion: jsonb("schedule_suggestion").$type<JsonObject>().notNull().default({}),
    configurationGuidance: jsonb("configuration_guidance").$type<JsonObject>().notNull().default({}),
    metadata: jsonb("metadata").$type<JsonObject>().notNull().default({}),
    lifecycle: text("lifecycle").$type<"draft" | "published">().notNull().default("published"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("blueprint_reference_item_versions_item_version_uq").on(
      table.itemId,
      table.versionNo,
    ),
  ],
);

export const blueprintConfigurationComponentReferences = educationV30.table(
  "blueprint_configuration_component_references",
  {
    configurationVersionId: uuid("configuration_version_id").notNull(),
    componentId: uuid("component_id").notNull(),
    referenceItemVersionId: uuid("reference_item_version_id").notNull(),
  },
  (table) => [
    primaryKey({
      name: "blueprint_configuration_component_references_pkey",
      columns: [
        table.configurationVersionId,
        table.componentId,
        table.referenceItemVersionId,
      ],
    }),
  ],
);

export const blueprintOutputs = educationV30.table(
  "blueprint_outputs",
  {
    id: id(),
    blueprintVersionId: uuid("blueprint_version_id").notNull(),
    executionBatchId: uuid("execution_batch_id").notNull(),
    configurationVersionId: uuid("configuration_version_id").notNull(),
    reviewId: uuid("review_id").notNull(),
    operationId: uuid("operation_id"),
    offeringVersionId: uuid("offering_version_id"),
    deploymentId: uuid("deployment_id"),
    producedAt: timestamp("produced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("blueprint_outputs_batch_operation_uq").on(
      table.executionBatchId,
      table.operationId,
    ),
    uniqueIndex("blueprint_outputs_batch_offering_uq").on(
      table.executionBatchId,
      table.offeringVersionId,
    ),
    uniqueIndex("blueprint_outputs_batch_deployment_uq").on(
      table.executionBatchId,
      table.deploymentId,
    ),
  ],
);

export const offerings = educationV30.table(
  "offerings",
  {
    id: id(),
    publisherOrganizationId: uuid("publisher_organization_id").notNull(),
    code: text("code").notNull(),
    title: text("title").notNull(),
    origin: text("origin").$type<"native" | "external" | "licensed">().notNull().default("native"),
    status: text("status").$type<"active" | "retired">().notNull().default("active"),
  },
  (table) => [
    uniqueIndex("offerings_publisher_code_uq").on(table.publisherOrganizationId, table.code),
  ],
);

export const offeringVersions = educationV30.table(
  "offering_versions",
  {
    id: id(),
    offeringId: uuid("offering_id").notNull(),
    versionNo: integer("version_no").notNull(),
    productDefinition: jsonb("product_definition").$type<JsonValue>().notNull().default({}),
    lifecycle: text("lifecycle").$type<"draft" | "published">().notNull().default("draft"),
    createdAt: createdAt(),
    publishedAt: timestamp("published_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("offering_versions_offering_version_uq").on(table.offeringId, table.versionNo),
    uniqueIndex("offering_versions_id_offering_uq").on(table.id, table.offeringId),
  ],
);

export const programDeployments = educationV30.table(
  "program_deployments",
  {
    id: id(),
    operationId: uuid("operation_id").notNull(),
    offeringId: uuid("offering_id").notNull(),
    code: text("code").notNull(),
    name: text("name").notNull(),
    status: text("status")
      .$type<"planning" | "review" | "authorized" | "active" | "suspended" | "closed">()
      .notNull()
      .default("planning"),
    createdAt: createdAt(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("program_deployments_operation_code_uq").on(table.operationId, table.code),
    uniqueIndex("program_deployments_id_operation_uq").on(table.id, table.operationId),
    uniqueIndex("program_deployments_id_offering_uq").on(table.id, table.offeringId),
  ],
);

export const deploymentOfferingAdoptions = educationV30.table(
  "deployment_offering_adoptions",
  {
    id: id(),
    deploymentId: uuid("deployment_id").notNull(),
    offeringId: uuid("offering_id").notNull(),
    offeringVersionId: uuid("offering_version_id").notNull(),
    validFrom: timestamp("valid_from", { withTimezone: true }).notNull(),
    validThrough: timestamp("valid_through", { withTimezone: true }),
    approvalStatus: text("approval_status")
      .$type<"proposed" | "approved" | "suspended" | "ended">()
      .notNull()
      .default("proposed"),
    approvedByPersonId: uuid("approved_by_person_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("deployment_offering_adoptions_id_deployment_uq").on(
      table.id,
      table.deploymentId,
    ),
    uniqueIndex("deployment_offering_adoptions_id_version_uq").on(
      table.id,
      table.offeringVersionId,
    ),
    uniqueIndex("deployment_offering_adoptions_id_provenance_uq").on(
      table.id,
      table.deploymentId,
      table.offeringVersionId,
    ),
  ],
);

export type BlueprintRow = typeof blueprints.$inferSelect;
export type BlueprintVersionRow = typeof blueprintVersions.$inferSelect;
export type BlueprintConfigurationRow = typeof blueprintConfigurations.$inferSelect;
export type BlueprintConfigurationVersionRow = typeof blueprintConfigurationVersions.$inferSelect;
export type BlueprintConfigurationComponentRow = typeof blueprintConfigurationComponents.$inferSelect;
export type BlueprintConfigurationLocalExperienceRow =
  typeof blueprintConfigurationLocalExperiences.$inferSelect;
export type BlueprintConfigurationOfferingIntentRow =
  typeof blueprintConfigurationOfferingIntents.$inferSelect;
export type BlueprintReferenceItemRow = typeof blueprintReferenceItems.$inferSelect;
export type BlueprintReferenceItemVersionRow =
  typeof blueprintReferenceItemVersions.$inferSelect;
export type ConfigurationReviewRow = typeof configurationReviews.$inferSelect;
export type BlueprintComponentApprovalDecisionRow =
  typeof blueprintComponentApprovalDecisions.$inferSelect;
export type BlueprintExecutionBatchRow = typeof blueprintExecutionBatches.$inferSelect;
export type BlueprintOutputRow = typeof blueprintOutputs.$inferSelect;
export type OfferingRow = typeof offerings.$inferSelect;
export type OfferingVersionRow = typeof offeringVersions.$inferSelect;
export type ProgramDeploymentRow = typeof programDeployments.$inferSelect;
export type DeploymentOfferingAdoptionRow = typeof deploymentOfferingAdoptions.$inferSelect;

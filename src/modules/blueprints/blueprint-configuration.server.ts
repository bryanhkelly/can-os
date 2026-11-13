import { isDeepStrictEqual } from "node:util";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import {
  auditEvents,
  blueprintComponents,
  blueprintConfigurationComponents,
  blueprintConfigurationComponentReferences,
  blueprintConfigurationLocalExperiences,
  blueprintConfigurationOfferingIntents,
  blueprintConfigurationVersions,
  blueprintConfigurations,
  blueprintReferenceItems,
  blueprintReferenceItemVersions,
  blueprintVersions,
  blueprints,
  domainEvents,
  offeringVersions,
  offerings,
  religiousAffiliationOptions,
} from "@/db/canonical-v301";
import {
  createBlueprintConfigurationInputSchema,
  saveBlueprintConfigurationInputSchema,
  submitBlueprintConfigurationInputSchema,
  blueprintConfigurationVersionInputSchema,
} from "@/domain/blueprint-configuration";
import { AuthorizationError, assertCapability, type CommandContext } from "@/domain/command-context";
import { DomainError } from "@/domain/errors";

const BLUEPRINT_CONFIGURE = "blueprint.configure";
const BLUEPRINT_READ = "blueprint.read";

type VersionInput = ReturnType<typeof blueprintConfigurationVersionInputSchema.parse>;
type ConfigurationResult = {
  configurationId: string;
  versionId: string;
  revision: number;
  lifecycle: "draft" | "frozen";
};
export type BlueprintConfigurationDetail = ConfigurationResult & {
  blueprintId: string;
  blueprintVersionId: string;
  name: string;
  config: typeof blueprintConfigurationVersions.$inferSelect.config;
  identity: {
    religiousAffiliationCode: string | null;
    editorialIdentity: typeof blueprintConfigurationVersions.$inferSelect.editorialIdentity;
    culturalContext: typeof blueprintConfigurationVersions.$inferSelect.culturalContext;
  };
  components: Array<{
    componentId: string;
    selectionStatus: typeof blueprintConfigurationComponents.$inferSelect.selectionStatus;
    settings: typeof blueprintConfigurationComponents.$inferSelect.settings;
    referenceItemVersionIds: string[];
  }>;
  offeringAdoptions: Array<{
    componentId: string;
    offeringVersionId: string;
    configuration: typeof blueprintConfigurationOfferingIntents.$inferSelect.configuration;
  }>;
  localExperiences: Array<{
    componentId: string;
    kind: typeof blueprintConfigurationLocalExperiences.$inferSelect.experienceKind;
    title: string;
    summary: string;
    configuration: typeof blueprintConfigurationLocalExperiences.$inferSelect.configuration;
  }>;
};

function assertAuthenticated(context: CommandContext): void {
  if (!context.actorPersonId) throw new AuthorizationError("authenticated session");
  assertCapability(context, BLUEPRINT_CONFIGURE);
}

function assertCanRead(context: CommandContext): void {
  if (!context.actorPersonId) throw new AuthorizationError("authenticated session");
  assertCapability(context, BLUEPRINT_READ);
}

function assertOrganization(context: CommandContext, organizationId: string): void {
  if (!context.scope.organizationIds?.includes(organizationId)) {
    throw new AuthorizationError(`organization scope: ${organizationId}`);
  }
}

function conflict(message: string): never {
  throw new DomainError("CONFLICT", message);
}

function sameVersionInput(
  existing: typeof blueprintConfigurationVersions.$inferSelect,
  components: Array<typeof blueprintConfigurationComponents.$inferSelect>,
  references: Array<typeof blueprintConfigurationComponentReferences.$inferSelect>,
  localExperiences: Array<typeof blueprintConfigurationLocalExperiences.$inferSelect>,
  offeringIntents: Array<typeof blueprintConfigurationOfferingIntents.$inferSelect>,
  input: VersionInput,
): boolean {
  const existingComponents = components
    .map((component) => ({
      componentId: component.componentId,
      selectionStatus: component.selectionStatus,
      settings: component.settings,
      referenceItemVersionIds: references
        .filter((reference) => reference.componentId === component.componentId)
        .map((reference) => reference.referenceItemVersionId)
        .sort(),
    }))
    .sort((a, b) => a.componentId.localeCompare(b.componentId));
  const requestedComponents = input.components
    .map((component) => ({
      componentId: component.componentId,
      selectionStatus: component.selectionStatus,
      settings: component.settings,
      referenceItemVersionIds: [...component.referenceItemVersionIds].sort(),
    }))
    .sort((a, b) => a.componentId.localeCompare(b.componentId));
  const existingOfferings = offeringIntents
    .map((intent) => ({
      componentId: intent.componentId,
      offeringVersionId: intent.offeringVersionId,
      configuration: intent.configuration,
    }))
    .sort((a, b) => `${a.componentId}:${a.offeringVersionId}`.localeCompare(
      `${b.componentId}:${b.offeringVersionId}`,
    ));
  const requestedOfferings = input.offeringAdoptions
    .map((intent) => ({
      componentId: intent.componentId,
      offeringVersionId: intent.offeringVersionId,
      configuration: intent.configuration,
    }))
    .sort((a, b) => `${a.componentId}:${a.offeringVersionId}`.localeCompare(
      `${b.componentId}:${b.offeringVersionId}`,
    ));
  const existingLocalExperiences = localExperiences
    .map((experience) => ({
      componentId: experience.componentId,
      kind: experience.experienceKind,
      title: experience.title,
      summary: experience.summary,
      configuration: experience.configuration,
    }))
    .sort((a, b) => `${a.componentId}:${a.title}`.localeCompare(`${b.componentId}:${b.title}`));
  const requestedLocalExperiences = input.localExperiences
    .map(({ componentId, kind, title, summary, configuration }) => ({
      componentId,
      kind,
      title,
      summary,
      configuration,
    }))
    .sort((a, b) => `${a.componentId}:${a.title}`.localeCompare(`${b.componentId}:${b.title}`));
  return isDeepStrictEqual(existing.config, input.config)
    && existing.religiousAffiliationCode === input.identity.religiousAffiliationCode
    && existing.editorialIdentity === input.identity.editorialIdentity
    && isDeepStrictEqual(existing.culturalContext, input.identity.culturalContext)
    && isDeepStrictEqual(existingComponents, requestedComponents)
    && isDeepStrictEqual(existingOfferings, requestedOfferings)
    && isDeepStrictEqual(existingLocalExperiences, requestedLocalExperiences);
}

async function loadAndCompareVersion(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  version: typeof blueprintConfigurationVersions.$inferSelect,
  input: VersionInput,
): Promise<boolean> {
  const [components, references, localExperiences, offeringIntents] = await Promise.all([
    tx.select().from(blueprintConfigurationComponents)
      .where(eq(blueprintConfigurationComponents.configurationVersionId, version.id)),
    tx.select().from(blueprintConfigurationComponentReferences)
      .where(eq(blueprintConfigurationComponentReferences.configurationVersionId, version.id)),
    tx.select().from(blueprintConfigurationLocalExperiences)
      .where(eq(blueprintConfigurationLocalExperiences.configurationVersionId, version.id)),
    tx.select().from(blueprintConfigurationOfferingIntents)
      .where(eq(blueprintConfigurationOfferingIntents.configurationVersionId, version.id)),
  ]);
  return sameVersionInput(version, components, references, localExperiences, offeringIntents, input);
}

async function assertVersionSelections(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  blueprintVersionId: string,
  input: VersionInput,
): Promise<void> {
  const componentIds = input.components.map((component) => component.componentId);
  if (componentIds.length > 0) {
    const components = await tx.select({ id: blueprintComponents.id })
      .from(blueprintComponents)
      .where(and(
        eq(blueprintComponents.blueprintVersionId, blueprintVersionId),
        inArray(blueprintComponents.id, componentIds),
      ));
    if (components.length !== componentIds.length) {
      throw new DomainError("VALIDATION_FAILED", "A selected component is not part of this Blueprint version.");
    }
  }

  const referenceIds = [...new Set(input.components.flatMap(
    (component) => component.referenceItemVersionIds,
  ))];
  if (referenceIds.length > 0) {
    const publishedReferences = await tx.select({ id: blueprintReferenceItemVersions.id })
      .from(blueprintReferenceItemVersions)
      .innerJoin(
        blueprintReferenceItems,
        eq(blueprintReferenceItems.id, blueprintReferenceItemVersions.itemId),
      )
      .where(and(
        inArray(blueprintReferenceItemVersions.id, referenceIds),
        eq(blueprintReferenceItemVersions.lifecycle, "published"),
        eq(blueprintReferenceItems.status, "active"),
      ));
    if (publishedReferences.length !== referenceIds.length) {
      throw new DomainError(
        "VALIDATION_FAILED",
        "Every selected reference must be active and published.",
      );
    }
  }

  const offeringVersionIds = [...new Set(
    input.offeringAdoptions.map((intent) => intent.offeringVersionId),
  )];
  if (offeringVersionIds.length > 0) {
    const availableOfferings = await tx.select({ id: offeringVersions.id })
      .from(offeringVersions)
      .innerJoin(offerings, eq(offerings.id, offeringVersions.offeringId))
      .where(and(
        inArray(offeringVersions.id, offeringVersionIds),
        eq(offeringVersions.lifecycle, "published"),
        eq(offerings.status, "active"),
      ));
    if (availableOfferings.length !== offeringVersionIds.length) {
      throw new DomainError("VALIDATION_FAILED", "Every adopted Offering must be active and published.");
    }
  }

  for (const experience of input.localExperiences) {
    const status = input.components.find(
      (component) => component.componentId === experience.componentId,
    )?.selectionStatus;
    if (status !== "selected" && status !== "proposed") {
      throw new DomainError(
        "VALIDATION_FAILED",
        "A local experience proposal must be connected to a selected or proposed component.",
      );
    }
  }

  const affiliationCode = input.identity.religiousAffiliationCode;
  if (affiliationCode) {
    const [affiliation] = await tx.select({ code: religiousAffiliationOptions.code })
      .from(religiousAffiliationOptions)
      .where(and(
        eq(religiousAffiliationOptions.code, affiliationCode),
        eq(religiousAffiliationOptions.active, true),
      ))
      .limit(1);
    if (!affiliation) {
      throw new DomainError("VALIDATION_FAILED", "The selected religious affiliation is not active.");
    }
  }
}

async function insertVersion(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  input: {
    versionId: string;
    configurationId: string;
    blueprintId: string;
    blueprintVersionId: string;
    revision: number;
    version: VersionInput;
  },
): Promise<typeof blueprintConfigurationVersions.$inferSelect> {
  const [version] = await tx.insert(blueprintConfigurationVersions)
    .values({
      id: input.versionId,
      configurationId: input.configurationId,
      blueprintId: input.blueprintId,
      blueprintVersionId: input.blueprintVersionId,
      revision: input.revision,
      config: input.version.config,
      religiousAffiliationCode: input.version.identity.religiousAffiliationCode,
      editorialIdentity: input.version.identity.editorialIdentity,
      culturalContext: input.version.identity.culturalContext,
    })
    .returning();
  if (!version) throw new Error("Blueprint configuration version insert returned no row");

  if (input.version.components.length > 0) {
    await tx.insert(blueprintConfigurationComponents).values(
      input.version.components.map((component) => ({
        configurationVersionId: version.id,
        blueprintVersionId: input.blueprintVersionId,
        componentId: component.componentId,
        selectionStatus: component.selectionStatus,
        settings: component.settings,
      })),
    );
    const references = input.version.components.flatMap((component) =>
      component.referenceItemVersionIds.map((referenceItemVersionId) => ({
        configurationVersionId: version.id,
        componentId: component.componentId,
        referenceItemVersionId,
      })),
    );
    if (references.length > 0) {
      await tx.insert(blueprintConfigurationComponentReferences).values(references);
    }
  }
  if (input.version.offeringAdoptions.length > 0) {
    await tx.insert(blueprintConfigurationOfferingIntents).values(
      input.version.offeringAdoptions.map((intent) => ({
        configurationVersionId: version.id,
        componentId: intent.componentId,
        offeringVersionId: intent.offeringVersionId,
        configuration: intent.configuration,
      })),
    );
  }
  if (input.version.localExperiences.length > 0) {
    await tx.insert(blueprintConfigurationLocalExperiences).values(
      input.version.localExperiences.map((experience) => ({
        configurationVersionId: version.id,
        componentId: experience.componentId,
        experienceKind: experience.kind,
        title: experience.title,
        summary: experience.summary,
        configuration: experience.configuration,
      })),
    );
  }
  return version;
}

async function recordMutation(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  context: CommandContext,
  input: {
    owningOrganizationId: string;
    action: "blueprint.configuration.created" | "blueprint.configuration.saved" |
      "blueprint.configuration.submitted";
    eventType: "BlueprintConfigurationCreated" | "BlueprintConfigurationSaved" |
      "BlueprintConfigurationSubmitted";
    configurationId: string;
    versionId: string;
    revision: number;
    lifecycle: "draft" | "frozen";
  },
): Promise<void> {
  const payload = {
    owningOrganizationId: input.owningOrganizationId,
    configurationId: input.configurationId,
    versionId: input.versionId,
    revision: input.revision,
    lifecycle: input.lifecycle,
    requestId: context.requestId ?? null,
  };
  await tx.insert(auditEvents).values({
    actorPersonId: context.actorPersonId,
    owningOrganizationId: input.owningOrganizationId,
    eventCode: input.action,
    entityKind: "blueprint_configuration",
    entityId: input.configurationId,
    payload,
  });
  await tx.insert(domainEvents).values({
    eventType: input.eventType,
    aggregateType: "blueprint_configuration",
    aggregateId: input.configurationId,
    actorPersonId: context.actorPersonId,
    payload,
  });
}

async function assertPublishedBlueprint(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  blueprintId: string,
  blueprintVersionId: string,
): Promise<void> {
  const [blueprint] = await tx.select({ status: blueprints.status })
    .from(blueprints)
    .where(eq(blueprints.id, blueprintId))
    .limit(1);
  const [version] = await tx.select({ lifecycle: blueprintVersions.lifecycle })
    .from(blueprintVersions)
    .where(and(
      eq(blueprintVersions.id, blueprintVersionId),
      eq(blueprintVersions.blueprintId, blueprintId),
    ))
    .limit(1);
  if (blueprint?.status !== "active" || version?.lifecycle !== "published") {
    throw new DomainError("VALIDATION_FAILED", "Select an active, published Blueprint version.");
  }
}

function asResult(
  configurationId: string,
  version: typeof blueprintConfigurationVersions.$inferSelect,
): ConfigurationResult {
  return {
    configurationId,
    versionId: version.id,
    revision: version.revision,
    lifecycle: version.lifecycle,
  };
}

export async function getBlueprintConfiguration(
  context: CommandContext,
  configurationId: string,
): Promise<BlueprintConfigurationDetail> {
  assertCanRead(context);
  const [configuration] = await db.select().from(blueprintConfigurations)
    .where(eq(blueprintConfigurations.id, configurationId))
    .limit(1);
  if (!configuration?.owningOrganizationId) {
    throw new DomainError("UNAVAILABLE", "Blueprint configuration is unavailable.");
  }
  assertOrganization(context, configuration.owningOrganizationId);

  const [version] = await db.select().from(blueprintConfigurationVersions)
    .where(eq(blueprintConfigurationVersions.configurationId, configuration.id))
    .orderBy(desc(blueprintConfigurationVersions.revision))
    .limit(1);
  if (!version) throw new DomainError("UNAVAILABLE", "Blueprint configuration has no version.");

  const [components, references, offeringAdoptions, localExperiences] = await Promise.all([
    db.select().from(blueprintConfigurationComponents)
      .where(eq(blueprintConfigurationComponents.configurationVersionId, version.id)),
    db.select().from(blueprintConfigurationComponentReferences)
      .where(eq(blueprintConfigurationComponentReferences.configurationVersionId, version.id)),
    db.select().from(blueprintConfigurationOfferingIntents)
      .where(eq(blueprintConfigurationOfferingIntents.configurationVersionId, version.id)),
    db.select().from(blueprintConfigurationLocalExperiences)
      .where(eq(blueprintConfigurationLocalExperiences.configurationVersionId, version.id)),
  ]);
  return {
    ...asResult(configuration.id, version),
    blueprintId: configuration.blueprintId,
    blueprintVersionId: version.blueprintVersionId,
    name: configuration.name,
    config: version.config,
    identity: {
      religiousAffiliationCode: version.religiousAffiliationCode,
      editorialIdentity: version.editorialIdentity,
      culturalContext: version.culturalContext,
    },
    components: components.map((component) => ({
      componentId: component.componentId,
      selectionStatus: component.selectionStatus,
      settings: component.settings,
      referenceItemVersionIds: references
        .filter((reference) => reference.componentId === component.componentId)
        .map((reference) => reference.referenceItemVersionId),
    })),
    offeringAdoptions: offeringAdoptions.map((intent) => ({
      componentId: intent.componentId,
      offeringVersionId: intent.offeringVersionId,
      configuration: intent.configuration,
    })),
    localExperiences: localExperiences.map((experience) => ({
      componentId: experience.componentId,
      kind: experience.experienceKind,
      title: experience.title,
      summary: experience.summary,
      configuration: experience.configuration,
    })),
  };
}

export async function createBlueprintConfiguration(
  context: CommandContext,
  rawInput: unknown,
): Promise<ConfigurationResult> {
  assertAuthenticated(context);
  const input = createBlueprintConfigurationInputSchema.parse(rawInput);
  assertOrganization(context, input.owningOrganizationId);

  return db.transaction(async (tx) => {
    const [existing] = await tx.select().from(blueprintConfigurations)
      .where(eq(blueprintConfigurations.id, input.configurationId))
      .limit(1)
      .for("update");
    if (existing) {
      if (
        existing.owningOrganizationId !== input.owningOrganizationId
        || existing.blueprintId !== input.blueprintId
        || existing.name !== input.name
      ) {
        return conflict("The configuration identifier is already in use.");
      }
      const [version] = await tx.select().from(blueprintConfigurationVersions)
        .where(and(
          eq(blueprintConfigurationVersions.id, input.initialVersionId),
          eq(blueprintConfigurationVersions.configurationId, input.configurationId),
        ))
        .limit(1);
      if (version && await loadAndCompareVersion(tx, version, input.version)) {
        return asResult(existing.id, version);
      }
      return conflict("The configuration creation command was already used with different content.");
    }

    await assertPublishedBlueprint(tx, input.blueprintId, input.blueprintVersionId);
    await assertVersionSelections(tx, input.blueprintVersionId, input.version);
    const [configuration] = await tx.insert(blueprintConfigurations)
      .values({
        id: input.configurationId,
        blueprintId: input.blueprintId,
        owningOrganizationId: input.owningOrganizationId,
        name: input.name,
      })
      .onConflictDoNothing({ target: blueprintConfigurations.id })
      .returning();
    if (!configuration) {
      const [racedConfiguration] = await tx.select().from(blueprintConfigurations)
        .where(eq(blueprintConfigurations.id, input.configurationId))
        .limit(1)
        .for("update");
      if (
        racedConfiguration
        && racedConfiguration.owningOrganizationId === input.owningOrganizationId
        && racedConfiguration.blueprintId === input.blueprintId
        && racedConfiguration.name === input.name
      ) {
        const [racedVersion] = await tx.select().from(blueprintConfigurationVersions)
          .where(and(
            eq(blueprintConfigurationVersions.id, input.initialVersionId),
            eq(blueprintConfigurationVersions.configurationId, input.configurationId),
          ))
          .limit(1);
        if (racedVersion && await loadAndCompareVersion(tx, racedVersion, input.version)) {
          return asResult(racedConfiguration.id, racedVersion);
        }
      }
      return conflict("The configuration creation command was already used with different content.");
    }
    const version = await insertVersion(tx, {
      versionId: input.initialVersionId,
      configurationId: configuration.id,
      blueprintId: input.blueprintId,
      blueprintVersionId: input.blueprintVersionId,
      revision: 1,
      version: input.version,
    });
    await recordMutation(tx, context, {
      owningOrganizationId: input.owningOrganizationId,
      action: "blueprint.configuration.created",
      eventType: "BlueprintConfigurationCreated",
      configurationId: configuration.id,
      versionId: version.id,
      revision: version.revision,
      lifecycle: version.lifecycle,
    });
    return asResult(configuration.id, version);
  });
}

export async function saveBlueprintConfiguration(
  context: CommandContext,
  rawInput: unknown,
): Promise<ConfigurationResult> {
  assertAuthenticated(context);
  const input = saveBlueprintConfigurationInputSchema.parse(rawInput);

  return db.transaction(async (tx) => {
    const [configuration] = await tx.select().from(blueprintConfigurations)
      .where(eq(blueprintConfigurations.id, input.configurationId))
      .limit(1)
      .for("update");
    if (!configuration?.owningOrganizationId) {
      throw new DomainError("UNAVAILABLE", "Blueprint configuration is unavailable.");
    }
    assertOrganization(context, configuration.owningOrganizationId);

    const [replayedVersion] = await tx.select().from(blueprintConfigurationVersions)
      .where(and(
        eq(blueprintConfigurationVersions.id, input.versionId),
        eq(blueprintConfigurationVersions.configurationId, configuration.id),
      ))
      .limit(1);
    if (replayedVersion) {
      if (await loadAndCompareVersion(tx, replayedVersion, input.version)) {
        return asResult(configuration.id, replayedVersion);
      }
      return conflict("The version identifier is already in use with different content.");
    }

    const [latest] = await tx.select().from(blueprintConfigurationVersions)
      .where(eq(blueprintConfigurationVersions.configurationId, configuration.id))
      .orderBy(desc(blueprintConfigurationVersions.revision))
      .limit(1);
    if (!latest) throw new DomainError("UNAVAILABLE", "Blueprint configuration has no version.");
    if (latest.revision !== input.expectedRevision) {
      return conflict("Blueprint configuration changed. Reload it before saving.");
    }
    if (latest.lifecycle === "draft" && await loadAndCompareVersion(tx, latest, input.version)) {
      return asResult(configuration.id, latest);
    }
    await assertVersionSelections(tx, latest.blueprintVersionId, input.version);
    const version = await insertVersion(tx, {
      versionId: input.versionId,
      configurationId: configuration.id,
      blueprintId: configuration.blueprintId,
      blueprintVersionId: latest.blueprintVersionId,
      revision: latest.revision + 1,
      version: input.version,
    });
    await recordMutation(tx, context, {
      owningOrganizationId: configuration.owningOrganizationId,
      action: "blueprint.configuration.saved",
      eventType: "BlueprintConfigurationSaved",
      configurationId: configuration.id,
      versionId: version.id,
      revision: version.revision,
      lifecycle: version.lifecycle,
    });
    return asResult(configuration.id, version);
  });
}

export async function submitBlueprintConfiguration(
  context: CommandContext,
  rawInput: unknown,
): Promise<ConfigurationResult> {
  assertAuthenticated(context);
  const input = submitBlueprintConfigurationInputSchema.parse(rawInput);

  return db.transaction(async (tx) => {
    const [configuration] = await tx.select().from(blueprintConfigurations)
      .where(eq(blueprintConfigurations.id, input.configurationId))
      .limit(1)
      .for("update");
    if (!configuration?.owningOrganizationId) {
      throw new DomainError("UNAVAILABLE", "Blueprint configuration is unavailable.");
    }
    assertOrganization(context, configuration.owningOrganizationId);
    const [version] = await tx.select().from(blueprintConfigurationVersions)
      .where(and(
        eq(blueprintConfigurationVersions.configurationId, configuration.id),
        eq(blueprintConfigurationVersions.revision, input.expectedRevision),
      ))
      .limit(1);
    if (!version) return conflict("Blueprint configuration changed. Reload it before submitting.");

    const [latest] = await tx.select().from(blueprintConfigurationVersions)
      .where(eq(blueprintConfigurationVersions.configurationId, configuration.id))
      .orderBy(desc(blueprintConfigurationVersions.revision))
      .limit(1);
    if (!latest || latest.id !== version.id) {
      return conflict("Blueprint configuration changed. Reload it before submitting.");
    }
    if (version.lifecycle === "frozen") return asResult(configuration.id, version);

    const [frozen] = await tx.update(blueprintConfigurationVersions)
      .set({ lifecycle: "frozen", frozenAt: new Date() })
      .where(and(
        eq(blueprintConfigurationVersions.id, version.id),
        eq(blueprintConfigurationVersions.lifecycle, "draft"),
      ))
      .returning();
    if (!frozen) return conflict("Blueprint configuration changed. Reload it before submitting.");
    await recordMutation(tx, context, {
      owningOrganizationId: configuration.owningOrganizationId,
      action: "blueprint.configuration.submitted",
      eventType: "BlueprintConfigurationSubmitted",
      configurationId: configuration.id,
      versionId: frozen.id,
      revision: frozen.revision,
      lifecycle: frozen.lifecycle,
    });
    return asResult(configuration.id, frozen);
  });
}

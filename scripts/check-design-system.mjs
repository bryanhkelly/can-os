import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../src/components/", import.meta.url));
const srcRoot = fileURLToPath(new URL("../src/", import.meta.url));
const files = [];
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.tsx$/.test(entry.name) && !/\.(?:stories|test|spec)\.tsx$/.test(entry.name)) files.push(path);
  }
}
walk(root);

// Export names alone do not prove duplicate implementations: different feature
// modules may legitimately export components with the same name. Keep the
// ownership check below scoped to canonical shared contracts.
console.log(`Design component inventory: ${files.length} component files checked.`);

// Enforce a single implementation of the canonical evidence interaction widgets.
// Deliberately specialized feature controls are excluded from this check.
const canonicalEvidence = ["EvidenceUploader", "EvidenceReviewForm", "EvidenceWorkflow", "EvidenceHistory", "EvidenceStatus", "EvidenceDocumentLink", "EvidenceDocumentSummary", "EvidenceUploadSection"];
for (const name of canonicalEvidence) {
  const implementationFiles = files.filter(file => {
    const relativePath = relative(root, file).replaceAll("\\", "/");
    if (relativePath.endsWith(".stories.tsx") || relativePath.endsWith("/index.tsx")) return false;
    return new RegExp("export\\s+(?:function|const)\\s+" + name + "\\b").test(readFileSync(file, "utf8"));
  });
  const implementationPath = implementationFiles[0] && relative(root, implementationFiles[0]).replaceAll("\\", "/");
  if (implementationFiles.length !== 1 || !implementationPath?.startsWith("evidence/")) {
    console.error(`Canonical evidence component ${name} must have exactly one implementation in components/evidence`);
    process.exitCode = 1;
  }
}


// Shared evidence controls should use the existing design-system action primitive.
for (const name of ["EvidenceUploader", "EvidenceReviewForm", "EvidenceDocumentLink"]) {
  const path = join(root, "evidence", name + ".tsx");
  const source = readFileSync(path, "utf8");
  if (!source.includes('from "@/components/ui/button"') || /<button(?:\s|>)/.test(source)) {
    console.error(`${name} must use the shared Button primitive for its actions`);
    process.exitCode = 1;
  }
}


// Layout contract: the shell and page frame read the same tokens, so the sidebar
// brand divider, top bar and page titles line up for every role and page.
const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
for (const token of ["--topbar-height", "--sidebar-width", "--page-gutter", "--page-pad-top", "--page-pad-bottom",
  "--content-reading", "--content-standard", "--content-wide", "--content-dashboard", "--text-3xs", "--text-2xs",
  "--text-section", "--tracking-eyebrow", "--eyebrow-color"]) {
  if (!new RegExp(token + "\\s*:").test(styles)) {
    console.error(`Design token ${token} must be defined in src/styles.css`);
    process.exitCode = 1;
  }
}
const shellContract = {
  "shell/WorkspaceSidebar.tsx": ["h-[var(--topbar-height)]"],
  "shell/WorkspaceTopBar.tsx": ["h-[var(--topbar-height)]", "px-[var(--page-gutter)]"],
  "shell/WorkspaceNavigation.tsx": ["can-shell"],
  "workspace/workspace-shell.tsx": ["PageFrame", "PageHeader"],
};
for (const [file, required] of Object.entries(shellContract)) {
  const source = readFileSync(join(root, file), "utf8");
  for (const value of required) if (!source.includes(value)) {
    console.error(`${file} must use ${value} so the shell stays on the shared layout grid`);
    process.exitCode = 1;
  }
}

// Canonical controls and surfaces must not depend on zero-radius tokens to look square.
for (const file of ["ui/button.tsx", "ui/choice.tsx", "ui/input.tsx", "ui/select.tsx", "ui/textarea.tsx", "ui/modal.tsx", "ui/table.tsx"]) {
  const source = readFileSync(join(root, file), "utf8");
  if (/(?:^|\s)rounded(?:-(?:none|sm|md|lg|xl|2xl|3xl|full|\[[^\]]+\]))?(?=\s|["'])/.test(source)) {
    console.error(`${file} must not set corner radii; canonical controls and surfaces are square`);
    process.exitCode = 1;
  }
}


// Feature-level adoption gate: protect migrated evidence interactions against
// raw native controls and corner-radius drift. Extend this manifest as feature
// components migrate; don't blanket-reject existing legacy UI in one release.
const governedFeatureControls = {
  "evidence/EvidenceUploader.tsx": {
    imports: ['@/components/ui/button', '@/components/ui/input', '@/components/ui/label'],
    forbidden: [/<input\b/, /<button\b/, /<select\b/, /<textarea\b/],
  },
  "evidence/FileSelectionField.tsx": {
    imports: ['@/components/ui/button', '@/components/ui/input', '@/components/ui/label'],
    forbidden: [/<input\b/, /<button\b/, /<select\b/, /<textarea\b/],
  },
};
const radiusUtility = /(?:^|[\s"'\x60])(?:[\w-]+:)*rounded(?:-(?:none|sm|md|lg|xl|2xl|3xl|full|\[[^\]]+\]))?(?=[\s"'\x60])/;
for (const [file, contract] of Object.entries(governedFeatureControls)) {
  const source = readFileSync(join(root, file), "utf8");
  for (const imported of contract.imports) {
    if (!source.includes(imported)) {
      console.error(`${file} must import governed design primitive ${imported}`);
      process.exitCode = 1;
    }
  }
  for (const forbidden of contract.forbidden) {
    if (forbidden.test(source)) {
      console.error(`${file} must compose shared inputs/actions instead of native controls`);
      process.exitCode = 1;
    }
  }
  if (radiusUtility.test(source)) {
    console.error(`${file} must retain V6.1 square-corner geometry`);
    process.exitCode = 1;
  }
}


// V6.1 canonical input/action adoption is checked component by component.
// Only add a consumer after replacing its native controls and clearing radius drift.
const canonicalControlConsumers = {
  "evidence/EvidencePicker.tsx": {
    imports: ['@/components/ui/field', '@/components/ui/select'],
    forbidden: [/<(?:input|select|textarea|button|label)\b/],
  },
  "learning/GradebookSectionSelector.tsx": {
    imports: ['@/components/ui/field', '@/components/ui/select'],
    forbidden: [/<(?:input|select|textarea|button|label)\b/],
  },
  "operations/SectionFacilitatorPanel.tsx": {
    imports: ['@/components/ui/button', '@/components/ui/field', '@/components/ui/select', './SiteStaffingFeedback'],
    forbidden: [/<(?:input|select|textarea|button|label)\b/],
  },
  "operations/LocalSiteDelegationPanel.tsx": {
    imports: ['@/components/ui/button', '@/components/ui/field', '@/components/ui/select', './SiteStaffingFeedback'],
    forbidden: [/<(?:input|select|textarea|button|label)\b/],
  },
  "operations/SchoolOpeningReviewPanel.tsx": {
    imports: ['@/components/ui/button', '@/components/ui/field', '@/components/ui/input'],
    forbidden: [/<(?:input|select|textarea|button|label)\b/],
  },
  "learning/SectionGradeFinalization.tsx": {
    imports: ['@/components/ui/button', '@/components/ui/field', '@/components/ui/input',
      '@/components/ui/select', '@/components/ui/textarea'],
    forbidden: [/<(?:input|select|textarea|button|label)\b/],
  },
  "operations/LaunchOpeningTask.tsx": {
    imports: ['@/components/ui/button', '@/components/ui/select', '@/components/ui/label'],
    forbidden: [/<(?:input|select|textarea|button|label)\b/],
  },
};
for (const [file, contract] of Object.entries(canonicalControlConsumers)) {
  const source = readFileSync(join(root, file), "utf8");
  for (const name of contract.imports) {
    if (!source.includes(name)) {
      console.error(`${file} must compose ${name}`);
      process.exitCode = 1;
    }
  }
  for (const forbidden of contract.forbidden) {
    if (forbidden.test(source)) {
      console.error(`${file} reintroduced a native control instead of V6.1 components`);
      process.exitCode = 1;
    }
  }
  if (radiusUtility.test(source)) {
    console.error(`${file} reintroduced legacy rounded geometry`);
    process.exitCode = 1;
  }
}

// V6.1 geometry is universal across shared workspace, workflow, and evidence components.
// Every new component in these families is checked automatically, not via a page allowlist.
for (const file of files) {
  const component = relative(root, file).replaceAll("\\", "/");
  if (!["workspace/", "workflow/", "evidence/"].some(prefix => component.startsWith(prefix))) continue;
  if (radiusUtility.test(readFileSync(file, "utf8"))) {
    console.error(`${component} must use V6.1 square-corner geometry`);
    process.exitCode = 1;
  }
}

// Layer 2 ownership: every directory uses the shared FilterBar composition,
// and neither the pattern nor its table may reintroduce rounded surfaces.
const sharedPatternContracts = {
  "workspace/filter-bar.tsx": ['from "@/components/ui/input"', 'from "@/components/ui/button"', 'from "@/components/ui/field"'],
  "workspace/directory-table.tsx": ['from "./filter-bar"', '<FilterBar'],
  "workspace/action-footer.tsx": ['data-action-footer', 'data-form-actions', 'data-dialog-actions', '"inline"'],
  "workspace/record-layout.tsx": ['export function RecordHeader', 'export function RecordLayout', 'export function RecordFacts', 'export function EntityCard', 'aria-label="Record actions"'],
  "workspace/form-page.tsx": ['from "./action-footer"', '<ActionFooter', 'loadingLabel={pendingLabel}',
    'aria-describedby={description ? descriptionId : undefined}', 'columns === 1'],
  "workspace/action-dialog.tsx": ['from "./action-footer"', '<ActionFooter', 'loadingLabel={pendingLabel}',
    'submitted.current', 'wasPending.current && !pending'],

};
for (const [file, required] of Object.entries(sharedPatternContracts)) {
  const source = readFileSync(join(root, file), "utf8");
  for (const fragment of required) {
    if (!source.includes(fragment)) {
      console.error(`${file} must reuse shared application patterns: missing ${fragment}`);
      process.exitCode = 1;
    }
  }
  if (radiusUtility.test(source)) {
    console.error(`${file} must retain V6.1 square-corner geometry`);
    process.exitCode = 1;
  }
}


// Feature-owned readers provide record facts; only their visual semantics are shared.
const governedRecordConsumers = {
  "routes/actions.$actionId.tsx": ["<RecordHeader", "<RecordLayout", "<RecordFacts", 'label="Action metadata"'],
  "routes/enrichment_.$seasonId.tsx": ["<RecordHeader", "<RecordLayout", "<RecordFacts", 'label="Program details"'],
  "routes/centers.demo.tsx": ["<RecordHeader", "<RecordLayout"],
  "routes/enrichment.tsx": ["<EntityCard", "renderLink=", 'openLabel="View details and register"'],
  "components/field-trips/FieldTripFacts.tsx": ["<RecordFacts", 'label="Field trip schedule and fee"'],
  "routes/student.field-trips.tsx": ["<FieldTripFacts trip={item}/>"],
  "routes/guardian.field-trips.tsx": ["<FieldTripFacts trip={item}/>"],
  "components/church/ChurchApplicationConfirmation.tsx": ["<RecordFacts", 'label="Submitted church application details"'],
  "components/enrollment/FirstSchoolDayHandoff.tsx": ["<RecordFacts", 'variant="tiles"',
    'label="School-day verification evidence"', '"Not yet observable"'],
};
for (const [file, required] of Object.entries(governedRecordConsumers)) {
  const source = readFileSync(join(srcRoot, file), "utf8");
  for (const fragment of required) if (!source.includes(fragment)) {
    console.error(`${file} must reuse V6.1 record composition: missing ${fragment}`);
    process.exitCode = 1;
  }
}

// Migrated feature-level RecordFacts compositions must retain right-angle geometry.
for (const path of [
  "components/field-trips/FieldTripFacts.tsx",
  "components/church/ChurchApplicationConfirmation.tsx",
  "components/enrollment/FirstSchoolDayHandoff.tsx",
]) {
  const source = readFileSync(join(srcRoot, path), "utf8");
  if (radiusUtility.test(source)) {
    console.error(`${path} must retain V6.1 square-corner record facts`);
    process.exitCode = 1;
  }
}

// Inline record actions share the same spacing and wrapping contract without
// turning record decisions into additional forms or changing server commands.
for (const path of [
  "operations/SchoolOpeningReviewPanel.tsx",
  "learning/SectionGradeFinalization.tsx",
  "operations/LocalSiteDelegationPanel.tsx",
]) {
  const source = readFileSync(join(root, path), "utf8");
  if (!source.includes('<ActionFooter layout="inline"') || radiusUtility.test(source)) {
    console.error(`${path} must compose a square V6.1 inline ActionFooter`);
    process.exitCode = 1;
  }
}

// ActionDialog callers retain their feature-owned authorization and mutation logic,
// while their confirmation forms must compose the canonical Field and input primitives.
for (const file of ["routes/operations.insights.tsx", "operations/OperationsWorkspace.tsx"]) {
  const sourceFile = file.startsWith("routes/") ? join(srcRoot, file) : join(root, file);
  const source = readFileSync(sourceFile, "utf8");
  const opening = source.indexOf("<ActionDialog");
  const closing = source.indexOf("</ActionDialog>", opening);
  if (opening < 0 || closing < opening) {
    console.error(`${file} must retain an ActionDialog`);
    process.exitCode = 1;
    continue;
  }
  const dialog = source.slice(opening, closing);
  if (!dialog.includes("<Field") || !dialog.includes("<Textarea") ||
      /<(?:input|textarea|label|select|button)\b/.test(dialog)) {
    console.error(`${file} must use V6.1 controls inside the ActionDialog`);
    process.exitCode = 1;
  }
}

// Layer 2 shared workspace surfaces and migrated feature forms must remain
// square and compose canonical controls, not rebuild browser widgets.
const governedWorkspaceSurfaces = [
  "workspace/workspace-panel.tsx",
  "workspace/notice.tsx",
  "workspace/page-navigation.tsx",
  "workspace/prerequisite-checklist.tsx",
];
for (const file of governedWorkspaceSurfaces) {
  const source = readFileSync(join(root, file), "utf8");
  if (radiusUtility.test(source)) {
    console.error(`${file} must use V6.1 square-corner surfaces`);
    process.exitCode = 1;
  }
}
const governedCompletionReview = readFileSync(join(root, "learning/NoncreditCompletionReviewPanel.tsx"), "utf8");
if (!governedCompletionReview.includes('from "@/components/ui/select"') ||
    /<select\b/.test(governedCompletionReview) ||
    radiusUtility.test(governedCompletionReview)) {
  console.error("Noncredit completion review must use the shared Select and V6.1 geometry");
  process.exitCode = 1;
}


// Tabular rosters use DirectoryTable; compact row lists use RosterList.
// Both remain presentation-only. Source authorization and enrollment stay server-owned.
const rosterConsumers = {
  // A tabular roster uses DirectoryTable; compact classroom lists use RosterList.
  "components/learning/ClassRosterPanel.tsx": ["DirectoryTable", 'from "@/components/workspace"'],
  "routes/classes.tsx": ["RosterList", 'from "@/components/workspace"'],
  "routes/class_.$classId.tsx": ["RosterList", 'from "@/components/workspace"'],
};
for (const [file, required] of Object.entries(rosterConsumers)) {
  const source = readFileSync(join(srcRoot, file), "utf8");
  for (const fragment of required) {
    if (!source.includes(fragment)) {
      console.error(`${file} must compose the canonical RosterList pattern: missing ${fragment}`);
      process.exitCode = 1;
    }
  }
}
const rosterPattern = readFileSync(join(root, "workspace/roster-list.tsx"), "utf8");
if (radiusUtility.test(rosterPattern)) {
  console.error("workspace/roster-list.tsx must retain V6.1 square corners");
  process.exitCode = 1;
}

// Canonical status presentation is reused by workflow prerequisites and evidence versions.
const statusConsumers = {
  "workflow/WorkflowPrerequisites.tsx": "PrerequisiteChecklist",
  "evidence/EvidenceHistory.tsx": "EvidenceStatus",
  "operations/AttentionQueue.tsx": "StatusBadge",
  "learning/CredentialDeliveryHistory.tsx": "StatusTimeline",
};
for (const [path, component] of Object.entries(statusConsumers)) {
  const source = readFileSync(join(root, path), "utf8");
  if (!source.includes(`<${component}`)) {
    console.error(`${path} must reuse canonical status component ${component}`);
    process.exitCode = 1;
  }
}

// Domain status and transport history are rendered through canonical visual
// components, while route-owned commands and timestamps remain authoritative.
const governedStatusRoutes = {
  "routes/operations.field-trips.tsx": ["<StatusBadge", "Guardian declined — NOT authorized to board"],
  "routes/admissions.credential-delivery.tsx": ["<CredentialDeliveryHistory records={history}/>"],
};
for (const [file, fragments] of Object.entries(governedStatusRoutes)) {
  const source = readFileSync(join(srcRoot, file), "utf8");
  for (const fragment of fragments) if (!source.includes(fragment)) {
    console.error(`${file} must preserve status visualization and authoritative safety copy: ${fragment}`);
    process.exitCode = 1;
  }
}
const transportStatus = readFileSync(join(root, "learning/CredentialDeliveryHistory.tsx"), "utf8");
if (!transportStatus.includes('"Accepted by provider"') ||
    transportStatus.includes('"Delivered to recipient"') || radiusUtility.test(transportStatus)) {
  console.error("Credential history may show provider acceptance, never unverified delivery");
  process.exitCode = 1;
}

// Domain telemetry composes the shared metric and status patterns.
// A list of source-authorized values is not a custom dashboard card API.
const metricConsumers = {
  "operations/OutboxHealthPanel.tsx": ["<StatCard", "<WorkspaceNotice", "<QueryState"],
  "operations/SiteStaffingFeedback.tsx": ["<WorkspaceNotice", "<Button"],
  "operations/SchoolOpeningReviewPanel.tsx": ["<StatusBadge", "<MutationFeedback", "<QueryState", "<Field", "<Button"],
  "learning/SectionGradeFinalization.tsx": ["<WorkspaceNotice", "<MutationFeedback", "<QueryState", "<Field", "<Button"],
};
for (const [file, required] of Object.entries(metricConsumers)) {
  const source = readFileSync(join(root, file), "utf8");
  for (const fragment of required) if (!source.includes(fragment)) {
    console.error(`${file} must use ${fragment}`);
    process.exitCode = 1;
  }
  if (radiusUtility.test(source)) {
    console.error(`${file} must retain V6.1 rectangular geometry`);
    process.exitCode = 1;
  }
}

// Shared workflow history must render through the V6.1 pattern while retaining
// the domain's existing decisions, credentials and server authorization.
const statusTimeline = readFileSync(join(root, "workflow/status-timeline.tsx"), "utf8");
const completionReview = readFileSync(join(root, "learning/NoncreditCompletionReviewPanel.tsx"), "utf8");
if (radiusUtility.test(statusTimeline) || !statusTimeline.includes("StatusBadge") ||
    !statusTimeline.includes("<time") || !statusTimeline.includes('aria-label={label}')) {
  console.error("StatusTimeline must preserve square geometry, semantic time and shared statuses");
  process.exitCode = 1;
}
if (!completionReview.includes('from "@/components/workflow"') ||
    (completionReview.match(/<StatusTimeline/g) ?? []).length !== 2) {
  console.error("Completion review must use shared StatusTimeline for decision and issuance history");
  process.exitCode = 1;
}

// Govern migrated approval and notification history surfaces.
// Native checkbox and textarea elements are prohibited at the feature layer;
// primitives preserve their underlying native accessibility semantics.
const migratedApplicationSurfaces = {
  "routes/canonical.assessment-reviews.tsx": [
    'from "@/components/ui/select"', 'from "@/components/ui/textarea"',
    'from "@/components/ui/choice"', 'from "@/components/ui/button"',
  ],
  "components/communication/DeliveryHistory.tsx": [
    'from "@/components/workflow"', "<StatusTimeline",
    'from "@/components/ui/button"',
  ],
};
for (const [file, required] of Object.entries(migratedApplicationSurfaces)) {
  const source = readFileSync(join(srcRoot, file), "utf8");
  for (const fragment of required) {
    if (!source.includes(fragment)) {
      console.error(`${file} must reuse governed application primitives/patterns: missing ${fragment}`);
      process.exitCode = 1;
    }
  }
  if (/<(?:select|textarea|button|input)\b/.test(source) ||
      radiusUtility.test(source)) {
    console.error(`${file} must compose canonical controls and square V6.1 surfaces`);
    process.exitCode = 1;
  }
}

// Blueprint and Section lifecycle screens use shared status presentation.
// The latest Blueprint decision is not a complete historical event stream.
const governedLifecycleStatuses = {
  "routes/canonical.blueprint-reviews.tsx": ["StatusBadge", "item.latestDecision", "No operating permission was granted"],
  "components/launch-studio/CanonicalBlueprintWorkspace.tsx": ["StatusBadge", "review.latestReview.decision", "planning-only"],
  "components/operations/SectionLifecycleManager.tsx": ["StatusBadge", "section.active"],
};
for (const [file, required] of Object.entries(governedLifecycleStatuses)) {
  const source = readFileSync(join(srcRoot, file), "utf8");
  for (const fragment of required) {
    if (!source.includes(fragment)) {
      console.error(file + " must preserve shared status presentation and scope: missing " + fragment);
      process.exitCode = 1;
    }
  }
  if (radiusUtility.test(source)) {
    console.error(file + " violates V6.1 square-corner geometry");
    process.exitCode = 1;
  }
}

// Blueprint history must come from its own authorized, bounded reader instead
// of reconstructing an event stream from latestReview or local UI transitions.
const blueprintHistoryPanel = readFileSync(join(root, "launch-studio/BlueprintReviewHistoryPanel.tsx"), "utf8");
const blueprintWorkspace = readFileSync(join(root, "launch-studio/CanonicalBlueprintWorkspace.tsx"), "utf8");
if (!blueprintHistoryPanel.includes("readCanonicalBlueprintReviewHistory") ||
    !blueprintHistoryPanel.includes("<StatusTimeline") ||
    !blueprintHistoryPanel.includes("history.data.hasMore") ||
    !blueprintWorkspace.includes("<BlueprintReviewHistoryPanel") ||
    radiusUtility.test(blueprintHistoryPanel)) {
  console.error("Launch Studio Blueprint review history must use the authorized paginated StatusTimeline");
  process.exitCode = 1;
}

// Native learner Class cards now compose governed status/choice/select controls;
// the historical read-model remains owned by native Class enrollment.
const nativeClassPage = readFileSync(join(srcRoot, "routes/class.tsx"), "utf8");
const nativeCardStart = nativeClassPage.indexOf("function EnrolledClassCard(");
const nativeCardEnd = nativeClassPage.indexOf("function NativeLearnerClasses", nativeCardStart);
const nativeCard = nativeClassPage.slice(nativeCardStart, nativeCardEnd < 0 ? undefined : nativeCardEnd);
if (nativeCardStart < 0 || !nativeCard.includes("<StatusBadge") ||
    !nativeCard.includes("<Select") || !nativeCard.includes("<Checkbox") ||
    /<(?:select|input)\b/.test(nativeCard) || radiusUtility.test(nativeCard)) {
  console.error("Native enrolled-Class lifecycle must compose V6.1 status and form primitives");
  process.exitCode = 1;
}

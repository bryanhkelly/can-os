import type { getCanonicalGroupWorkspace, getStudyGroupAvailability } from "@/modules/study-groups/canonical-workspace.functions";
import type { useMutationFeedback } from "@/lib/mutation-feedback";
import type { StudyGroupRecord } from "@/domain/study-group-display";

export type GroupPanelRecord = StudyGroupRecord;
export type GroupPanelRole = Awaited<ReturnType<typeof getCanonicalGroupWorkspace>>["role"];
export type GroupPanelAvailability = Awaited<ReturnType<typeof getStudyGroupAvailability>>;
export type GroupPanelRun = (work: () => Promise<unknown>, message: string) => Promise<void>;
export type GroupPanelMutation = ReturnType<typeof useMutationFeedback>;

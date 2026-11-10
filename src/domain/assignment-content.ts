/**
 * Optional structured assignment content stored in assessments.metadata.assignmentContent.
 * Every field is optional; plain assessments.instructions remains the fallback body.
 * The reader is defensive: malformed or oversized metadata renders as absent
 * rather than throwing inside loaders.
 */
export type AssignmentStep = { title: string; detail: string };
export type AssignmentContent = {
  description: string | null;
  overview: string[];
  prompt: string | null;
  objectives: string[];
  steps: AssignmentStep[];
  formatNote: string | null;
};

export const ASSIGNMENT_CONTENT_LIMITS = {
  text: 2000,
  listItems: 12,
} as const;

function readText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text && text.length <= ASSIGNMENT_CONTENT_LIMITS.text ? text : null;
}

function readTextList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map(readText).filter((item): item is string => item !== null)
    .slice(0, ASSIGNMENT_CONTENT_LIMITS.listItems);
}

function readSteps(value: unknown): AssignmentStep[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap(item => {
    if (!item || typeof item !== "object") return [];
    const title = readText((item as Record<string, unknown>).title);
    const detail = readText((item as Record<string, unknown>).detail);
    if (!title) return [];
    return [{ title, detail: detail ?? "" }];
  }).slice(0, ASSIGNMENT_CONTENT_LIMITS.listItems);
}

export function readAssignmentContent(value: unknown): AssignmentContent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const content: AssignmentContent = {
    description: readText(record.description),
    overview: readTextList(record.overview),
    prompt: readText(record.prompt),
    objectives: readTextList(record.objectives),
    steps: readSteps(record.steps),
    formatNote: readText(record.formatNote),
  };
  const empty = !content.description && !content.overview.length && !content.prompt &&
    !content.objectives.length && !content.steps.length && !content.formatNote;
  return empty ? null : content;
}

export type AssignmentContentDraft = {
  description: string; overview: string; prompt: string;
  objectives: string; steps: string; formatNote: string;
};

/** Teacher authoring payload: blank-line paragraphs, one list item per line, "title | detail" steps. */
export function parseAssignmentContentDraft(draft: AssignmentContentDraft): {
  description?: string; overview?: string[]; prompt?: string;
  objectives?: string[]; steps?: AssignmentStep[]; formatNote?: string;
} | null {
  const lines = (value: string) => value.split(/\r?\n/).map(line => line.trim())
    .filter(Boolean).slice(0, ASSIGNMENT_CONTENT_LIMITS.listItems);
  const overview = draft.overview.split(/\r?\n\s*\r?\n/).map(paragraph => paragraph.replace(/\s+/g, " ").trim())
    .filter(Boolean).slice(0, ASSIGNMENT_CONTENT_LIMITS.listItems);
  const steps = lines(draft.steps).flatMap(line => {
    const [title = "", ...rest] = line.split("|");
    return title.trim() ? [{ title: title.trim(), detail: rest.join("|").trim() }] : [];
  });
  const objectives = lines(draft.objectives);
  const description = draft.description.trim();
  const prompt = draft.prompt.trim();
  const formatNote = draft.formatNote.trim();
  const payload = {
    ...(description ? { description } : {}),
    ...(overview.length ? { overview } : {}),
    ...(prompt ? { prompt } : {}),
    ...(objectives.length ? { objectives } : {}),
    ...(steps.length ? { steps } : {}),
    ...(formatNote ? { formatNote } : {}),
  };
  return Object.keys(payload).length ? payload : null;
}

import { z } from "zod";
import { canonicalLearningEventSchema } from "./canonical-learning-activity";

export const MAX_LEARNING_OUTBOX_EVENTS = 48;
export const MAX_LEARNING_OUTBOX_AGE_MS = 4 * 60_000;

export const learningOutboxItemSchema = z.object({
  learningSessionId: z.string().uuid(),
  event: canonicalLearningEventSchema,
}).strict();
export type LearningOutboxItem = z.infer<typeof learningOutboxItemSchema>;

/** No names, identities, answers, raw tokens, or grades enter tab storage. */
export function pruneLearningOutbox(
  value: unknown, sessionId: string, now: Date,
): LearningOutboxItem[] {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_LEARNING_OUTBOX_EVENTS).flatMap(item => {
    const parsed=learningOutboxItemSchema.safeParse(item);
    if(!parsed.success || parsed.data.learningSessionId!==sessionId) return [];
    const eventTime=Date.parse(parsed.data.event.occurredAt);
    if(!Number.isFinite(eventTime) || now.getTime()-eventTime>MAX_LEARNING_OUTBOX_AGE_MS ||
      eventTime>now.getTime()+15_000) return [];
    return [parsed.data];
  });
}

/** Retry reuses the exact event UUID; the server deduplicates it. */
export async function drainLearningOutbox(
  items: LearningOutboxItem[],
  send: (item: LearningOutboxItem) => Promise<unknown>,
): Promise<{remaining:LearningOutboxItem[];failed:boolean}> {
  for(let i=0;i<items.length;i++){
    try { await send(items[i]!); }
    catch { return {remaining:items.slice(i),failed:true}; }
  }
  return {remaining:[],failed:false};
}

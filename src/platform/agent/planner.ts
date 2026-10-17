/**
 * Deterministic intent planner. This implements the same contract an LLM
 * planner will later fill (message + context in, typed plan out); keeping it
 * rule-based for v1 means every Golden Flow test runs without external AI,
 * and tool execution is always deterministic and authorized regardless.
 */
export type AgentPlan =
  | { intent: "ask"; kind: "student_summary"; studentQuery: string }
  | {
      intent: "watch";
      studentQuery: string;
      eventTypes: string[];
      remindAfterHours?: number;
    }
  | { intent: "manage"; action: "list" | "pause" | "resume" | "revoke" }
  | { intent: "ask"; kind: "help" };

const WATCH_VERB = /(tell me|let me know|notify me|alert me|watch|monitor|keep an eye)/i;
const MISSING_TOPIC = /(miss|missing|late|overdue|assignment|homework)/i;

const NAME_PATTERNS = [
  /(?:when|if)\s+(\w+?)\s+(?:misses|has|is|gets)/i,
  /(?:watch|monitor|for)\s+(\w+)(?:'s)?(?:\s|$)/i,
  /how(?:'s| is)\s+(\w+)/i,
];

function extractName(message: string): string | null {
  for (const pattern of NAME_PATTERNS) {
    const match = message.match(pattern);
    if (match?.[1] && !/^(my|the|a|an|me)$/i.test(match[1])) return match[1];
  }
  return null;
}

function extractReminderHours(message: string): number | undefined {
  if (/next day|following day|daily/i.test(message)) return 24;
  const hours = message.match(/(?:after|every)\s+(\d+)\s*hours?/i);
  if (hours?.[1]) return Number(hours[1]);
  if (/weekly|every friday/i.test(message)) return 24 * 7;
  return undefined;
}

export function planTurn(message: string): AgentPlan {
  const text = message.trim();

  if (WATCH_VERB.test(text) && MISSING_TOPIC.test(text)) {
    const studentQuery = extractName(text) ?? "";
    return {
      intent: "watch",
      studentQuery,
      eventTypes: ["AssignmentBecameMissing"],
      remindAfterHours: extractReminderHours(text),
    };
  }

  const askMatch = text.match(/how(?:'s| is| are)\s+(\w+)/i);
  if (askMatch?.[1]) {
    return { intent: "ask", kind: "student_summary", studentQuery: askMatch[1] };
  }

  if (/(what are you watching|my (watches|agents|subscriptions)|things can is watching)/i.test(text)) {
    return { intent: "manage", action: "list" };
  }

  if (/(turn off|stop watching|revoke|cancel that watch)/i.test(text)) {
    return { intent: "manage", action: "revoke" };
  }
  if (/^pause|pause (that|the|my) watch/i.test(text)) {
    return { intent: "manage", action: "pause" };
  }
  if (/^resume|resume (that|the|my) watch/i.test(text)) {
    return { intent: "manage", action: "resume" };
  }

  return { intent: "ask", kind: "help" };
}

export const HELP_TEXT = [
  "Here's what I can do right now:",
  "- Ask about a student's progress: “How is Bobby doing?”",
  "- Watch for missing work: “Tell me when Bobby misses an assignment.”",
  "- Manage watches: “What are you watching for me?” or “Turn off that watch.”",
  "Everything I do uses your permissions, and anything that changes something asks for your confirmation first.",
].join("\n");

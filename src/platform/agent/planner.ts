/**
 * Deterministic, conservative v1 planner. An LLM may propose plans later, but
 * an unrecognized utterance must never silently become a consequential action.
 */
export type AgentPlan =
  | { intent: "ask"; kind: "student_summary"; studentQuery: string }
  | { intent: "watch"; studentQuery: string; eventTypes: string[]; remindAfterHours?: number }
  | { intent: "manage"; action: "list" | "pause" | "resume" | "revoke" }
  | { intent: "ask"; kind: "help" };

const missing = /\b(miss(?:ed|es|ing)?|late|overdue|past[ -]due|unsubmitted|not turned in|not handed in|assignment(?:s)?|homework|coursework|schoolwork)\b/i;
const watchVerb = /\b(?:tell me|let me know|notify me|alert me|watch|monitor|keep an eye|give me (?:a |an )?(?:heads[ -]up|alert)|send me (?:a |an )?(?:notification|alert)|ping me)\b/i;
const summaryVerb = /\b(?:how(?:'s| is| are)|how (?:has|did)|give me (?:an? )?(?:update|summary|overview)|(?:show|check|review|summarize|tell me about) (?:the )?(?:progress|grades|performance|status|schoolwork|academic)|(?:what|where) (?:are|is) .*?(?:grades|progress)|is .*?doing (?:in|at) school)\b/i;
const token = String.raw`[\p{L}][\p{L}'’.-]*`;
const fullName = String.raw`${token}(?:\s+${token}){0,2}`;
const nonNames = new Set(["my","our","the","a","an","me","any","all","their","his","her","child","kid","student","son","daughter","children","kids","students","assignment","assignments","homework","work","grades","grade","progress","school","class","classes","biology","math","english","science","history","teacher","when","if","you","can","please","someone","anyone"]);
const trailingWords = /\s+(?:doing|miss(?:es|ed|ing)?|has|is|gets|does|did|was|will|fails|forgets|falls|struggles|turns|hands|submits|in|at|with|on|about|from|again|today|tomorrow|yesterday|this|their|his|her|my|any|an|a|the)\b.*$/i;
const patterns = [
  new RegExp(String.raw`\b(?:when|if)\s+(${fullName})\s+(?:misses|missed|has|is|gets|does|fails|forgets|falls)\b`, "iu"),
  new RegExp(String.raw`\b(${fullName})['’]s\s+(?:assignments?|homework|schoolwork|grades?|progress)\b`, "iu"),
  new RegExp(String.raw`\b(?:for|about|watch|monitor|on|regarding)\s+(${fullName})(?=\s|[?.!,]|$)`, "iu"),
  new RegExp(String.raw`\bhow(?:'s| is| has)\s+(${fullName})(?=\s|[?.!,]|$)`, "iu"),
  new RegExp(String.raw`\b(?:is|are)\s+(${fullName})\s+doing\b`, "iu"),
  new RegExp(String.raw`\b(?:tell me|let me know|notify me|alert me|ping me)\s+(?:when|if)\s+(${fullName})\s+(?:misses|missed|has|is|gets|does)\b`, "iu"),
];

function cleanName(value: string): string {
  return value.replace(trailingWords, "").replace(/[?.!,]+$/, "").trim();
}
export function extractStudentQuery(message: string): string {
  for (const pattern of patterns) {
    const m = pattern.exec(message);
    if (!m?.[1]) continue;
    const candidate = cleanName(m[1]);
    const words = candidate.split(/\s+/);
    if (!candidate || words.some(w => nonNames.has(w.toLowerCase())) || words.length > 3) continue;
    return candidate;
  }
  return "";
}

function reminderHours(message: string): number | undefined {
  if (/\b(?:next day|following day|tomorrow|daily)\b/i.test(message)) return 24;
  const match = /\b(?:after|every|in)\s+(\d{1,3})\s*(hours?|days?)\b/i.exec(message);
  if (match) {
    const value = Number(match[1]) * (/day/i.test(match[2]) ? 24 : 1);
    return value > 0 && value <= 720 ? value : undefined;
  }
  if (/\bweekly\b|\bevery friday\b/i.test(message)) return 168;
  return undefined;
}

export function planTurn(message: string): AgentPlan {
  const text = message.trim().replace(/[‘’]/g, "'");
  if (/\b(?:what (?:are|is) (?:you|can) watching|show (?:me )?my watches|my (?:watches|subscriptions)|things can is watching|list (?:my )?watches)\b/i.test(text))
    return { intent: "manage", action: "list" };
  if (/\b(?:turn off|stop watching|revoke|cancel (?:that|the|my) watch|delete (?:that|the|my) watch)\b/i.test(text))
    return { intent: "manage", action: "revoke" };
  if (/\b(?:pause|suspend) (?:that|the|my|this)?\s*(?:watch|monitoring|alert)\b/i.test(text))
    return { intent: "manage", action: "pause" };
  if (/\b(?:resume|restart|unpause) (?:that|the|my|this)?\s*(?:watch|monitoring|alert)\b/i.test(text))
    return { intent: "manage", action: "resume" };

  if (watchVerb.test(text) && missing.test(text)) {
    return { intent: "watch", studentQuery: extractStudentQuery(text),
      eventTypes: ["AssignmentBecameMissing"], remindAfterHours: reminderHours(text) };
  }
  if (summaryVerb.test(text)) {
    return { intent: "ask", kind: "student_summary", studentQuery: extractStudentQuery(text) };
  }
  return { intent: "ask", kind: "help" };
}

export const HELP_TEXT = [
  "Here's what I can do right now:",
  "- Ask about a student's progress: “How is Bobby doing?”",
  "- Watch for missing work: “Tell me when Bobby misses an assignment.”",
  "- Manage watches: “What are you watching for me?” or “Turn off that watch.”",
  "For shared names, use the student's full name. I won't choose a student without your confirmation.",
  "Everything I do uses your permissions, and anything that changes something asks for your confirmation first.",
].join("\n");

/**
 * Planned instructional supervision, NOT confirmation that a person arrived,
 * a room is staffed, or a learner is physically present.
 *
 * This view consumes existing active sections, schedule periods and delivery
 * arrangements. No new attendance or private student records are created.
 */
export type SupervisionBlockInput = {
  sectionId: string;
  sectionTitle: string;
  programId: string;
  programName: string;
  periodId: string | null;
  periodLabel: string | null;
  startsAtLocal: string | null;
  endsAtLocal: string | null;
  facilitatorPersonId: string | null;
  facilitatorName: string | null;
  verifiedSiteStaffGrant: boolean;
  /** False if this specific site-local date lacks an approved instructional calendar day. */
  instructionalDayConfirmed?: boolean;
  overlappingFacilitatorAssignments?: boolean;
};

/** Compare an assigned adult's effective UTC interval to a specific
 * site-local scheduled block. Cross-time-zone sections must not be declared
 * staffed merely because the effective window touches the same UTC date. */
export function coversLocalSupervisionBlock(input:{
  date:string;timeZone:string;startsAtLocal:string;endsAtLocal:string;
  effectiveFrom:Date|null;effectiveThrough:Date|null;
}):boolean{
  const start=minutes(input.startsAtLocal), end=minutes(input.endsAtLocal);
  if(start===null||end===null||end<=start)return false;
  const stamp=(minute:number)=>input.date+"T"+String(Math.floor(minute/60)).padStart(2,"0")+
    ":"+String(minute%60).padStart(2,"0")+":00";
  const local=(date:Date)=>{
    const parts=new Intl.DateTimeFormat("en-US",{
      timeZone:input.timeZone,year:"numeric",month:"2-digit",day:"2-digit",
      hour:"2-digit",minute:"2-digit",second:"2-digit",hourCycle:"h23",
    }).formatToParts(date);
    const byType=Object.fromEntries(parts.map(part=>[part.type,part.value]));
    return byType.year+"-"+byType.month+"-"+byType.day+
      "T"+byType.hour+":"+byType.minute+":"+byType.second;
  };
  return (!input.effectiveFrom||local(input.effectiveFrom)<=stamp(start)) &&
    (!input.effectiveThrough||local(input.effectiveThrough)>=stamp(end));
}

export type SupervisionGap =
  "schedule_missing" | "facilitator_missing" | "staff_grant_missing" |
  "facilitator_conflict" | "room_unconfigured" | "calendar_unverified";

function minutes(input: string | null): number | null {
  if (!input) return null;
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(input);
  if (!match) return null;
  const h=Number(match[1]), m=Number(match[2]);
  return h >= 0 && h < 24 && m >= 0 && m < 60 ? h * 60 + m : null;
}

export function summarizeOnsiteSupervision(
  rows: readonly SupervisionBlockInput[],
) {
  const blocks = rows.map(row => {
    const start = minutes(row.startsAtLocal);
    const end = minutes(row.endsAtLocal);
    const gaps: SupervisionGap[] = [];
    if (!row.periodId || start === null || end === null || end <= start)
      gaps.push("schedule_missing");
    if (row.instructionalDayConfirmed === false) gaps.push("calendar_unverified");
    if (!row.facilitatorPersonId) gaps.push("facilitator_missing");
    else if (!row.verifiedSiteStaffGrant) gaps.push("staff_grant_missing");
    if (row.overlappingFacilitatorAssignments) gaps.push("facilitator_conflict");
    // CAN OS currently has no authoritative section-room assignment; never
    // silently claim that an instructional section has a supervised room.
    gaps.push("room_unconfigured");
    return {
      ...row, gaps, startMinute:start, endMinute:end,
      assignedPlan: gaps.every(gap => gap === "room_unconfigured"),
    };
  });
  for (let i=0;i<blocks.length;i++) {
    const a=blocks[i]!;
    if (!a.facilitatorPersonId || a.startMinute===null || a.endMinute===null) continue;
    for (let j=i+1;j<blocks.length;j++) {
      const b=blocks[j]!;
      if (a.sectionId===b.sectionId || a.facilitatorPersonId!==b.facilitatorPersonId ||
          b.startMinute===null || b.endMinute===null) continue;
      if (a.startMinute < b.endMinute && b.startMinute < a.endMinute) {
        for (const entry of [a,b]) {
          if (!entry.gaps.includes("facilitator_conflict")) entry.gaps.push("facilitator_conflict");
          entry.assignedPlan=false;
        }
      }
    }
  }
  return {
    blocks:blocks.map(({startMinute:_start,endMinute:_end,...item})=>item),
    plannedAssignments:blocks.filter(x=>x.assignedPlan).length,
    unassignedOrConflicting:blocks.filter(x=>!x.assignedPlan).length,
    roomAssignmentsUnverified:blocks.length,
    hasConfirmedPhysicalCoverage:false as const,
    note:"This is a staffing PLAN from approved instructional days, section schedules and current assignments. A closure or missing calendar entry cannot be treated as scheduled instruction. No authoritative room assignment, onsite presence, child release or custody approval exists in this view.",
  };
}

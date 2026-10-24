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
  /** Independently verified bounded child-safety credential evidence. */
  verifiedSafeguardingScreening?: boolean;
  verifiedSafeguardingTraining?: boolean;
  /** Independent verified room and distinct qualified backup, not presence. */
  /** Internal room evidence identity invalidates stale witnessed arrivals. */
  roomEvidenceVersion?: string | null;
  roomLabel?: string | null;
  roomPlanVerified?: boolean;
  namedBackupVerified?: boolean;
  roomCapacityAdequate?: boolean;
  /** Backup is used only for overlap validation; omit it from public responses. */
  backupPersonId?: string | null;
  /** Only required for independently church-hosted CAN Programs. */
  requiresSectionDelegation?: boolean;
  /** The actual named person's appointment must cover this entire block. */
  verifiedSectionDelegation?: boolean;
  /** The current church/CAN contract must authorize supervised onsite services. */
  authorizedSupervisionService?: boolean;
  /** Internal source IDs for invalidating stale duty acknowledgements; removed before response. */
  delegationVersion?: string | null;
  agreementVersion?: string | null;
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
  "facilitator_conflict" | "room_unconfigured" | "calendar_unverified" |
  "section_delegation_missing" | "operating_agreement_missing" |
  "child_safety_screening_missing" | "safeguarding_training_missing" |
  "qualified_backup_missing" | "room_capacity_unverified" |
  "room_schedule_conflict";

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
    if (row.requiresSectionDelegation && row.verifiedSectionDelegation !== true)
      gaps.push("section_delegation_missing");
    if (row.requiresSectionDelegation && row.authorizedSupervisionService !== true)
      gaps.push("operating_agreement_missing");
    if (row.requiresSectionDelegation && row.verifiedSafeguardingScreening !== true)
      gaps.push("child_safety_screening_missing");
    if (row.requiresSectionDelegation && row.verifiedSafeguardingTraining !== true)
      gaps.push("safeguarding_training_missing");
    if (row.overlappingFacilitatorAssignments) gaps.push("facilitator_conflict");
    // A scheduled adult is not evidence that a suitable room or second
    // safeguarding-qualified adult will actually be available onsite.
    if (row.roomPlanVerified !== true) gaps.push("room_unconfigured");
    if (row.requiresSectionDelegation && row.namedBackupVerified !== true)
      gaps.push("qualified_backup_missing");
    if (row.requiresSectionDelegation && row.roomPlanVerified && row.roomCapacityAdequate !== true)
      gaps.push("room_capacity_unverified");
    return {
      ...row, gaps, startMinute:start, endMinute:end,
      assignedPlan: gaps.length === 0 ||
        (!row.requiresSectionDelegation && gaps.every(gap => gap === "room_unconfigured")),
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
  // A standby backup cannot be booked as another Section’s primary or
  // standby for the same overlapping time period at the same Site.
  for(let i=0;i<blocks.length;i++){
    const a=blocks[i]!;
    if(!a.backupPersonId || a.startMinute===null || a.endMinute===null)continue;
    for(let j=i+1;j<blocks.length;j++){
      const b=blocks[j]!;
      if(a.sectionId===b.sectionId || b.startMinute===null || b.endMinute===null ||
         !(a.startMinute<b.endMinute && b.startMinute<a.endMinute))continue;
      // Different Sections cannot both claim the same physical room at the
      // same time. A plan signed for each Section individually is not proof
      // that their shared space can hold two simultaneous classes.
      if(a.roomPlanVerified && b.roomPlanVerified && a.roomLabel && b.roomLabel &&
         a.roomLabel.trim().toLocaleLowerCase()===b.roomLabel.trim().toLocaleLowerCase()){
        for(const entry of [a,b]){
          if(!entry.gaps.includes("room_schedule_conflict"))
            entry.gaps.push("room_schedule_conflict");
          entry.assignedPlan=false;
        }
      }
      if(a.backupPersonId===b.facilitatorPersonId ||
         (b.backupPersonId && a.backupPersonId===b.backupPersonId) ||
         (b.backupPersonId && b.backupPersonId===a.facilitatorPersonId)){
        for(const entry of [a,b]){
          if(!entry.gaps.includes("facilitator_conflict"))entry.gaps.push("facilitator_conflict");
          entry.assignedPlan=false;
        }
      }
    }
  }
  return {
    blocks:blocks.map(({startMinute:_start,endMinute:_end,...item})=>item),
    plannedAssignments:blocks.filter(x=>x.assignedPlan).length,
    unassignedOrConflicting:blocks.filter(x=>!x.assignedPlan).length,
    roomAssignmentsUnverified:blocks.filter(x=>!x.roomPlanVerified).length,
    hasConfirmedPhysicalCoverage:false as const,
    note:"This is a STAFFING PLAN, not a school-opening or physically supervised-day approval. Independent church/CAN staff require valid individual screening and safeguarding-training evidence. Approved instructional days and duty responses cannot establish actual onsite presence, backup coverage, room safety, child release or custody.",
  };
}

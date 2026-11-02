/** Conservative launch guidance until a verified published jurisdiction profile is available. */
export function jurisdictionSetupGuidance(code: string) {
  const normalized=code.toUpperCase().replace(/^US[-_]/,"");
  const names:Record<string,string>={TX:"Texas",FL:"Florida",AZ:"Arizona",WV:"West Virginia",AR:"Arkansas",IA:"Iowa",OK:"Oklahoma",WI:"Wisconsin"};
  const name=names[normalized];
  return {
    summary:name
      ? `CAN is preparing a verified ${name} profile covering church-hosted operations, home education pathways, and applicable education funding programs. Eligibility and requirements have not yet been confirmed for this school.`
      : "CAN will verify the operating requirements and funding pathways applicable to this school before opening.",
    nextStep:"Continue configuring the school. CAN will review applicable authorization, staffing, attendance, academic and funding requirements before opening.",
  };
}

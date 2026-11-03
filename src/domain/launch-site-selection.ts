/**
 * Never silently redirect a bookmarked school setup or Program handoff to
 * a different church Site. This helper checks only already-authorized results.
 */
export function launchSiteSelectionIssue(
  selection:{siteId?:string;programId?:string},
  sites:readonly {id:string}[],
  programs:readonly {id:string;siteId?:string|null}[],
):"site_unavailable"|"program_unavailable"|"site_program_mismatch"|null {
  const site=selection.siteId?sites.find(item=>item.id===selection.siteId):null;
  const program=selection.programId?programs.find(item=>item.id===selection.programId):null;
  if(selection.siteId&&!site)return "site_unavailable";
  if(selection.programId&&!program)return "program_unavailable";
  if(program?.siteId&&selection.siteId&&program.siteId!==selection.siteId)
    return "site_program_mismatch";
  if(program?.siteId&&!sites.some(item=>item.id===program.siteId))
    return "site_unavailable";
  return null;
}

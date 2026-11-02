export function getWorkspaceScopeLabel(
  member: { siteId: string | null },
  sites: readonly { id: string; name: string }[],
): string {
  if (member.siteId) {
    return sites.find(site => site.id === member.siteId)?.name ?? "Assigned school";
  }
  if (sites.length === 1) return `School scope: ${sites[0]!.name}`;
  if (sites.length > 1) return `All authorized schools (${sites.length})`;
  return "Organization workspace";
}

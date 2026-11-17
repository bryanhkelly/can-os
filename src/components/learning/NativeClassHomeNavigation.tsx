import { Link } from "@tanstack/react-router";
import { DetailNavigation } from "@/components/workspace";
import { useActiveWorkspaceMember } from "@/components/shell/workspace-session-context";
import { canonicalRoleCapabilities } from "@/domain/canonical-access";

type Props = {
  mode: "explore" | "manage";
  siteId?: string;
  search?: string;
  classId?: string;
  offeringVersionId?: string;
};

/** One route, two sections. Menu visibility is a UX hint only: server
 * commands independently verify role, adoption, Site, and Class authority. */
export function NativeClassHomeNavigation({
  mode, siteId, search, classId, offeringVersionId,
}: Props) {
  const grant = useActiveWorkspaceMember();
  const canManage = Boolean(grant && Object.hasOwn(canonicalRoleCapabilities, grant.role) &&
    canonicalRoleCapabilities[grant.role as keyof typeof canonicalRoleCapabilities].includes("class.manage"));
  return <DetailNavigation label="Class workspace sections" variant="record">
    <Link to="/class" search={{siteId,search,classId,view:undefined}}
      aria-current={mode==="explore"?"page":undefined}>
      Explore and enroll
    </Link>
    {(canManage || mode==="manage") && <Link to="/class"
      search={{view:"manage",siteId,offeringVersionId}}
      aria-current={mode==="manage"?"page":undefined}>
      Manage Classes
    </Link>}
  </DetailNavigation>;
}

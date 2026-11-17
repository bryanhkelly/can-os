import { Link } from "@tanstack/react-router";
import { DetailNavigation } from "@/components/workspace";
import { useActiveWorkspaceMember } from "@/components/shell/workspace-session-context";
import { roleCapabilities } from "@/domain/access-context";

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
  const canManage = Boolean(grant && roleCapabilities[grant.role]?.includes("class.manage"));
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

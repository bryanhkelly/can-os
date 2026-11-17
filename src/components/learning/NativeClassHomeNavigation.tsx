import { Link } from "@tanstack/react-router";
import { DetailNavigation } from "@/components/workspace";
import { useActiveWorkspaceMember } from "@/components/shell/workspace-session-context";
import { canonicalRoleCapabilities } from "@/domain/canonical-access";

type Props = {
  mode: "explore" | "manage" | "activities" | "content" | "reviews";
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
  // Provider content is an organization-wide, evidence-backed appointment,
  // not a general Class/Site management capability.
  const canAuthorContent = (grant?.role as string|undefined)==="academic_content_creator";
  const canReviewContent = (grant?.role as string|undefined)==="academic_content_reviewer";
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
    {(canManage || mode==="activities") && <Link to="/class"
      search={{view:"activities"}}
      aria-current={mode==="activities"?"page":undefined}>
      Publisher activities
    </Link>}
    {(canAuthorContent || mode==="content") && <Link to="/class"
      search={{view:"content"}}
      aria-current={mode==="content"?"page":undefined}>
      Recorded instruction
    </Link>}
    {(canReviewContent || mode==="reviews") && <Link to="/class"
      search={{view:"reviews"}}
      aria-current={mode==="reviews"?"page":undefined}>
      Independent content reviews
    </Link>}
  </DetailNavigation>;
}

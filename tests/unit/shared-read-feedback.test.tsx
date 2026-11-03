import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentType, ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  reads: {} as Record<string, {
    data?: unknown; isPending: boolean; isError: boolean; isFetching: boolean; error?: unknown;
    refetch: ReturnType<typeof vi.fn>;
  }>,
}));
vi.mock("@tanstack/react-query", async original => ({
  ...await original<typeof import("@tanstack/react-query")>(),
  useQuery: (options: { queryKey: readonly unknown[] }) => state.reads[String(options.queryKey[0])],
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: { component: ComponentType }) => ({ options }),
  Link: ({ children }: { children: ReactNode }) => <>{children}</>,
  useRouter: () => ({ invalidate: vi.fn() }),
}));
vi.mock("@/modules/learning/academic-credential-delivery.functions", () => ({
  listMyAcademicCredentialReleases: vi.fn(), downloadAuthorizedAcademicCredential: vi.fn(),
}));
vi.mock("@/modules/learning/graduation.functions", () => ({
  approveGraduationRequirements: vi.fn(), classifyLegacyGraduationRequirements: vi.fn(),
  getApplicableGraduationPolicy: vi.fn(), listGraduationCandidates: vi.fn(),
  auditIssuedTranscript: vi.fn(), decideGraduation: vi.fn(), issueDiploma: vi.fn(),
  getDiplomaFreshness: vi.fn(), revokeDiploma: vi.fn(), listTranscriptDiplomas: vi.fn(),
  listGraduationRequirements: vi.fn(), listGraduationIssuers: vi.fn(),
}));
vi.mock("@/modules/enrollment/guardian-enrollment-checklist.functions", () => ({
  getGuardianEnrollmentChecklist: vi.fn(),
}));
vi.mock("@/modules/enrollment/r2-document-upload.functions", () => ({
  beginEnrollmentDocumentUpload: vi.fn(), finishEnrollmentDocumentUpload: vi.fn(),
  getEnrollmentDocumentDownload: vi.fn(), getEnrollmentDocumentUploadAvailability: vi.fn(),
}));
vi.mock("@/components/enrollment/EnrollmentForm", () => ({
  GuardianEnrollmentForm: () => <p>Ordinary enrollment form</p>,
}));

import { Route as CredentialsRoute } from "@/routes/admissions.my-credentials";
import { Route as GraduationRoute } from "@/routes/admissions.graduation";
import { GuardianEnrollmentChecklist } from "@/components/enrollment/GuardianEnrollmentChecklist";

function renderRoute(route: typeof CredentialsRoute | typeof GraduationRoute) {
  const Component = route.options.component;
  if (!Component) throw new Error("Missing route component");
  return renderToStaticMarkup(<Component/>);
}
beforeEach(() => {
  for (const key of ["my-academic-credential-releases", "graduation-issuers", "guardian-enrollment-checklist",
    "enrollment-document-upload-availability"]) {
    state.reads[key] = { isPending: false, isError: false, isFetching: false, refetch: vi.fn() };
  }
});

describe("shared read feedback in consumer screens", () => {
  it("shows loading instead of falsely claiming there are no credential releases", () => {
    state.reads["my-academic-credential-releases"]!.isPending = true;
    const html = renderRoute(CredentialsRoute);
    expect(html).toContain("Loading your records...");
    expect(html).not.toContain("No active official-record releases");
  });
  it("hides stale credential releases on read failure and offers explicit retry", () => {
    Object.assign(state.reads["my-academic-credential-releases"]!, {
      isError: true, error: new Error("private diagnostic"),
      data: [{ id: "stale", transcriptId: "transcript", purpose: "Stale protected purpose", expiresAt: "2030-01-01" }],
    });
    const html = renderRoute(CredentialsRoute);
    expect(html).toContain("Unable to load your records");
    expect(html).toContain("Retry");
    expect(html).not.toContain("Stale protected purpose");
    expect(html).not.toContain("private diagnostic");
  });
  it("shows a real empty credential state only after a successful read", () => {
    state.reads["my-academic-credential-releases"]!.data = [];
    expect(renderRoute(CredentialsRoute)).toContain("No active official-record releases are available");
  });
  it("surfaces institution read errors instead of silently showing an empty issuer selector", () => {
    Object.assign(state.reads["graduation-issuers"]!, {
      isError: true, error: new Error("private diagnostic"), data: [{ id: "stale", name: "Stale issuer" }],
    });
    const html = renderRoute(GraduationRoute);
    expect(html).toContain("Unable to load authorized institutions.");
    expect(html).toContain("Retry");
    expect(html).not.toContain("Stale issuer");
    expect(html).not.toContain("private diagnostic");
  });
  it("does not block ordinary enrollment forms when storage availability fails", () => {
    state.reads["guardian-enrollment-checklist"]!.data = {
      applicationId: "isolated-application", closed: false, synthetic: false,
      requirements: [{ id: "form", title: "School form", status: "needs_you", form: { revision: 1 }, documents: [] }],
    };
    Object.assign(state.reads["enrollment-document-upload-availability"]!, {
      isError: true, error: new Error("storage offline"),
    });
    const html = renderToStaticMarkup(<GuardianEnrollmentChecklist applicationId="isolated-application"/>);
    expect(html).toContain("Ordinary enrollment form");
    expect(html).toContain("Secure document upload availability could not be confirmed");
    expect(html).not.toContain('type="file"');
  });
  it("hides stale checklist content and exposes read retry after a failed refresh", () => {
    Object.assign(state.reads["guardian-enrollment-checklist"]!, {
      isError: true, error: new Error("offline"),
      data: { applicationId: "isolated-application", requirements: [{ id: "stale", title: "Stale requirement" }] },
    });
    const html = renderToStaticMarkup(<GuardianEnrollmentChecklist applicationId="isolated-application"/>);
    expect(html).toContain("Unable to load enrollment checklist");
    expect(html).toContain("Retry");
    expect(html).not.toContain("Stale requirement");
  });
});

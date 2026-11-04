import type { Meta, StoryObj } from "@storybook/react-vite";
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router";
import { expect, within } from "storybook/test";
import { CurriculumLibrary } from "./CurriculumLibrary";
import { WorkspaceShell } from "@/components/workspace/workspace-shell";
import type { getCurriculumMarketplace } from "@/modules/learning/curriculum-marketplace.functions";

type Marketplace = Awaited<ReturnType<typeof getCurriculumMarketplace>>;
const programId = "a1000000-0000-4000-8000-000000000001";
const marketplace: Marketplace = {
  program: { id: programId, name: "Example Academy", siteId: "a1000000-0000-4000-8000-000000000002" },
  canPublish: false, sections: [], overlays: [],
  packs: [{
    id: "pack-1", slug: "example-core", name: "High School Core", description: "Original synthetic curriculum for isolated UI testing.",
    publisherOrganizationId: "publisher-1", publisherName: "Example Publisher", licenseCode: "CC0",
    versionId: "release-1", version: 1, entitlement: "active", adoption: { versionId: "release-1", status: "active" },
    courses: ["Algebra I", "Biology", "English Literature"].map((title, index) => ({
      packVersionId: "release-1", courseVersionId: `course-${index}`, position: index, code: `CORE-${index}`, title,
      subject: ["Mathematics", "Science", "English"][index]!,
      preview: { syllabusSummary: "Original synthetic course outline.", moduleCount: 6, lessonCount: 36,
        weeksPlanned: 36, modules: [], outlineTruncated: false },
      recommendation: { available: true, licensed: true, adopted: true, accessReady: true, instructionReady: true,
        recommended: true, explanation: "Synthetic licensed and adopted course with instruction." },
    })),
  }],
};

const meta = {
  title: "Learning/Curriculum",
  component: CurriculumLibrary,
  args: { marketplaces: [marketplace] },
  decorators: [(Story) => {
    const root = createRootRoute({ component: () => (
      <WorkspaceShell title="Curriculum" width="wide" subtitle="Your selected curriculum and published courses, all in one place.">
        <div className="pt-6"><Story /></div>
      </WorkspaceShell>
    ) });
    return <RouterProvider router={createRouter({ routeTree: root, history: createMemoryHistory({ initialEntries: ["/"] }) })} />;
  }],
} satisfies Meta<typeof CurriculumLibrary>;
export default meta;
type Story = StoryObj<typeof meta>;

export const SelectedCurriculum: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Selected curriculum")).toBeVisible();
    for (const title of ["Algebra I", "Biology", "English Literature"]) {
      await expect(canvas.getByText(title)).toBeVisible();
    }
    await expect(canvas.getByRole("link", { name: "View curriculum" })).toHaveAttribute(
      "href", `/operations/curriculum-marketplace?programId=${programId}#curriculum-pack-release-1`,
    );
    await expect(canvas.queryByText("You haven't selected a curriculum")).not.toBeInTheDocument();
    await expect(canvasElement.querySelector("details")).toBeNull();
  },
};
export const NoSelection: Story = {
  args: { marketplaces: [{ ...marketplace, packs: marketplace.packs.map((pack) => ({ ...pack, adoption: null })) }] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("You haven't selected a curriculum")).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Choose curriculum" })).toBeVisible();
    await expect(canvas.getByRole("link", { name: "Review curriculum" })).toBeVisible();
    await expect(canvas.queryByText("Selected curriculum")).not.toBeInTheDocument();
  },
};
export const LicenseUnavailable: Story = {
  args: { marketplaces: [{ ...marketplace, packs: marketplace.packs.map((pack) => ({ ...pack, entitlement: "revoked" })) }] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(await canvas.findByText("Selected curriculum")).toBeVisible();
    await expect(canvas.getByRole("status")).toHaveTextContent("License revoked");
  },
};

import { useState } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { Button } from "./button";
import { Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, TableRowHead } from "./table";

const meta = {
  id: "v6-1-foundations-semantic-tables", title: "02 Primitives/Semantic tables",
  parameters: {
    layout: "fullscreen",
    chromatic: { modes: { light: { theme: "light" }, dark: { theme: "dark" }, site: { theme: "site" } } },
  },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const assessments = ["Reading analysis", "Research paper", "Unit assessment"];
const students = [
  { id: "jordan", name: "Jordan Lee", cells: ["Returned", "Submitted", "Not started"] },
  { id: "avery", name: "Avery Morgan", cells: ["Graded", "Returned", "Submitted"] },
];

function GradebookGridExample() {
  const [opened, setOpened] = useState<string | null>(null);
  return <div className="min-w-0 bg-background p-4 text-foreground sm:p-8">
    <h1 className="mb-4 font-serif text-2xl">Gradebook table preview</h1>
    <Table scrollLabel="Gradebook student assessment grid" aria-label="Gradebook student assessment grid"
      className="min-w-[42rem] border-collapse text-sm">
      <TableCaption className="sr-only">Sample assessment results for two example students</TableCaption>
      <TableHeader><TableRow>
        <TableHead scope="col">Student</TableHead>
        {assessments.map(title => <TableHead scope="col" key={title}>{title}</TableHead>)}
      </TableRow></TableHeader>
      <TableBody>{students.map(student => <TableRow key={student.id}>
        <TableRowHead>{student.name}</TableRowHead>
        {student.cells.map((status, index) => <TableCell key={assessments[index]}>
          <Button type="button" size="sm" variant="outline"
            onClick={() => setOpened(`${student.name}: ${assessments[index]}`)}>
            {status}
          </Button>
        </TableCell>)}
      </TableRow>)}</TableBody>
    </Table>
    <output className="mt-4 block text-sm" aria-live="polite">
      {opened ? `Opened: ${opened}` : "Select a grade cell to preview its action."}
    </output>
  </div>;
}

export const ResponsiveGradebookSemantics: Story = {
  render: () => <GradebookGridExample />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const table = canvas.getByRole("table", { name: "Gradebook student assessment grid" });
    await expect(table).toBeVisible();
    await expect(within(table).getAllByRole("columnheader")).toHaveLength(4);
    await expect(within(table).getAllByRole("rowheader")).toHaveLength(2);
    const submitted = within(table).getAllByRole("button", { name: "Submitted" })[0];
    if (!submitted) throw new Error("Expected a Submitted cell in the sample gradebook.");
    await userEvent.click(submitted);
    await expect(canvas.getByText("Opened: Jordan Lee: Research paper")).toBeVisible();
    await expect(canvas.getByRole("region", { name: "Gradebook student assessment grid" })).toHaveAttribute("tabindex", "0");
  },
};

export const ReadOnlyEvidence: Story = {
  render: () => <div className="bg-background p-4 text-foreground">
    <Table scrollLabel="Participation by Site" aria-label="Participation by Site">
      <TableCaption>Participation by Site. The totals are illustrative and not funding evidence.</TableCaption>
      <TableHeader><TableRow>
        <TableHead scope="col">Site</TableHead>
        <TableHead scope="col">Registered</TableHead>
        <TableHead scope="col">Completed</TableHead>
      </TableRow></TableHeader>
      <TableBody><TableRow>
        <TableRowHead>Community learning center</TableRowHead>
        <TableCell>24</TableCell>
        <TableCell>19</TableCell>
      </TableRow></TableBody>
    </Table>
  </div>,
};

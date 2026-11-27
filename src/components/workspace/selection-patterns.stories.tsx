import { useState, useId } from "react";
import type { Meta, StoryObj } from "@storybook/react-vite";
import { Checkbox, Radio } from "@/components/ui/choice";
import { SelectionCard } from "./selection-card";
import { SelectionChip, SelectionChipGroup } from "./selection-chip";
import { StatusBadge } from "./workspace-panel";

const meta = {id: "workspace-selection-patterns", title: "04 Application patterns/Selection patterns",parameters:{layout:"padded"}} satisfies Meta;
export default meta;
type Story=StoryObj<typeof meta>;
function Comparison(){
  const radioName=useId();
  const [program,setProgram]=useState("academic");
  const [day,setDay]=useState(false);
  const [topics,setTopics]=useState<string[]>(["Digital literacy"]);
  const [audiences,setAudiences]=useState<string[]>(["Adults"]);
  const [checked,setChecked]=useState(true);
  const [mode,setMode]=useState("in-person");
  const toggle=(values:string[],value:string,active:boolean)=>active?[...new Set([...values,value])]:values.filter(item=>item!==value);
  return <div className="max-w-3xl space-y-6">
    <header><h1 className="font-serif text-3xl">Choose the right selection pattern</h1><p className="text-sm text-muted-foreground">Use the shared components. Business rules and persistence belong to the feature.</p></header>
    <fieldset className="space-y-2"><legend className="text-sm font-semibold">Selection card</legend>
      <p className="text-xs text-muted-foreground">Significant choices requiring a description.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectionCard kind="radio" name={radioName} value="academic" title="Grades 6–12" detail="Full academic programming" checked={program==="academic"} onChange={()=>setProgram("academic")}/>
        <SelectionCard kind="radio" name={radioName} value="summer" title="Summer programs" detail="Seasonal learning experiences" checked={program==="summer"} onChange={()=>setProgram("summer")}/>
      </div>
    </fieldset>
    <fieldset className="space-y-2"><legend className="text-sm font-semibold">Compact selection card</legend>
      <p className="text-xs text-muted-foreground">Secondary decisions that still need explanatory text.</p>
      <SelectionCard compact kind="checkbox" title="Weekdays" detail="Monday through Friday" checked={day} onChange={setDay}/>
    </fieldset>
    <fieldset className="space-y-2"><legend className="text-sm font-semibold">Standard selection chip</legend>
      <p className="text-xs text-muted-foreground">Curated topics and experiences.</p>
      <SelectionChipGroup density="standard">{["Digital literacy","Financial literacy","Career readiness"].map(value=><SelectionChip key={value} density="standard" selected={topics.includes(value)} onChange={active=>setTopics(old=>toggle(old,value,active))}>{value}</SelectionChip>)}</SelectionChipGroup>
    </fieldset>
    <fieldset className="space-y-2"><legend className="text-sm font-semibold">Compact selection chip</legend>
      <p className="text-xs text-muted-foreground">Dense taxonomies and broad audience selections.</p>
      <SelectionChipGroup>{["Adults","Veterans","Immigrants","Caregivers","English language learners"].map(value=><SelectionChip key={value} selected={audiences.includes(value)} onChange={active=>setAudiences(old=>toggle(old,value,active))}>{value}</SelectionChip>)}</SelectionChipGroup>
    </fieldset>
    <fieldset className="space-y-2"><legend className="text-sm font-semibold">Native choice controls</legend>
      <label className="flex items-center gap-2 text-sm"><Checkbox checked={checked} onChange={event=>setChecked(event.currentTarget.checked)}/>Include reminders</label>
      {["in-person","online"].map(value=><label key={value} className="flex items-center gap-2 text-sm"><Radio name={radioName+"-mode"} value={value} checked={mode===value} onChange={()=>setMode(value)}/>{value}</label>)}
    </fieldset>
    <section className="space-y-2"><h2 className="text-sm font-semibold">Status badge</h2><p className="text-xs text-muted-foreground">Read-only status, never an interactive choice.</p><div className="flex flex-wrap gap-2"><StatusBadge tone="neutral">Draft</StatusBadge><StatusBadge tone="success">Approved</StatusBadge><StatusBadge tone="attention">Needs review</StatusBadge></div></section>
  </div>;
}
export const ComparisonGuide:Story={render:()=> <Comparison/>};

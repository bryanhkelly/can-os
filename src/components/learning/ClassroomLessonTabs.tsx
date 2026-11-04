import { useId, useRef, useState, type ReactNode } from "react";

type LessonTab = "materials" | "transcript" | "notes" | "discussion";
export function ClassroomLessonTabs({ materials, transcript, notes, discussion }: {
  materials: ReactNode; transcript: ReactNode; notes?: ReactNode; discussion?: ReactNode;
}) {
  const id = useId();
  const [selected, setSelected] = useState<LessonTab>("materials");
  const refs = useRef<Partial<Record<LessonTab, HTMLButtonElement | null>>>({});
  const tabs: { id: LessonTab; label: string; content: ReactNode }[] = [
    { id: "materials", label: "Overview", content: materials },
    { id: "transcript", label: "Transcript", content: transcript },
    ...(notes ? [{ id: "notes" as const, label: "My notes", content: notes }] : []),
    ...(discussion ? [{ id: "discussion" as const, label: "Discussion", content: discussion }] : []),
  ];
  return <div className="classroom-lesson-information border bg-card">
    <div role="tablist" aria-label="Lesson workspace" className="flex overflow-x-auto border-b">
      {tabs.map((tab, index) => <button key={tab.id} type="button" role="tab" ref={element => { refs.current[tab.id] = element; }}
        id={`${id}-${tab.id}-tab`} aria-controls={`${id}-${tab.id}-panel`} aria-selected={selected === tab.id}
        tabIndex={selected === tab.id ? 0 : -1} onClick={() => setSelected(tab.id)}
        onKeyDown={event => {
          let next: number | undefined;
          if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
          if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
          if (event.key === "Home") next = 0;
          if (event.key === "End") next = tabs.length - 1;
          if (next === undefined) return;
          event.preventDefault();
          const target = tabs[next]!;
          setSelected(target.id); refs.current[target.id]?.focus();
        }} className={`shrink-0 border-b-2 px-4 py-3 text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${selected === tab.id ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
        {tab.label}
      </button>)}
    </div>
    {tabs.map(tab => <div key={tab.id} role="tabpanel" id={`${id}-${tab.id}-panel`} aria-labelledby={`${id}-${tab.id}-tab`}
      hidden={selected !== tab.id} tabIndex={0} className="p-5 sm:p-6">{tab.content}</div>)}
  </div>;
}

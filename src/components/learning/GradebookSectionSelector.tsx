import type { ChangeEvent } from "react";

export interface GradebookSectionOption {
  id: string;
  title: string;
  code: string;
}

export interface GradebookSectionSelectorProps<T extends GradebookSectionOption> {
  sections: readonly T[];
  selectedId: string;
  onSelect: (sectionId: string) => void;
  disabled?: boolean;
  label?: string;
}

/** Presentation only: the caller must provide authorized teacher sections. */
export function GradebookSectionSelector<T extends GradebookSectionOption>({
  sections,
  selectedId,
  onSelect,
  disabled = false,
  label = "Choose a section",
}: GradebookSectionSelectorProps<T>) {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const sectionId = event.currentTarget.value;
    if (sections.some((section) => section.id === sectionId)) onSelect(sectionId);
  };

  return (
    <label className="block text-sm font-medium">
      <span>{label}</span>
      <select
        aria-label={label}
        className="mt-2 w-full rounded-lg border bg-background p-3"
        value={selectedId}
        disabled={disabled || sections.length === 0}
        onChange={handleChange}
      >
        {sections.length === 0 && <option value="">No available sections</option>}
        {sections.map((section) => (
          <option key={section.id} value={section.id}>
            {section.title} ({section.code})
          </option>
        ))}
      </select>
    </label>
  );
}

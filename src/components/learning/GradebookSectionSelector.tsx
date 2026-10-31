import type { ChangeEvent } from "react";

export interface GradebookSectionOption {
  id: string;
  name: string;
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
  label = "Section",
}: GradebookSectionSelectorProps<T>) {
  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const sectionId = event.currentTarget.value;
    if (sections.some((section) => section.id === sectionId)) onSelect(sectionId);
  };

  return (
    <label>
      <span>{label}</span>
      <select
        aria-label={label}
        value={selectedId}
        disabled={disabled || sections.length === 0}
        onChange={handleChange}
      >
        {sections.length === 0 && <option value="">No available sections</option>}
        {sections.map((section) => (
          <option key={section.id} value={section.id}>
            {section.name}
          </option>
        ))}
      </select>
    </label>
  );
}

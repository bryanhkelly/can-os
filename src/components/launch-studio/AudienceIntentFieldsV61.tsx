import { Users, Heart, House, Globe2, HandHeart, Accessibility, type LucideIcon } from "lucide-react";
import { siteAudienceGroups, type SitePlanningAudienceId } from "@/domain/site-audiences";
import { SelectionChip, SelectionChipGroup, WorkspaceNotice } from "@/components/workspace";

const audienceIcons = {
  age_and_life_stage: Users,
  families_and_caregivers: Heart,
  economic_and_housing: House,
  immigration_and_language: Globe2,
  life_circumstances: HandHeart,
  access_and_inclusion: Accessibility,
} satisfies Record<(typeof siteAudienceGroups)[number]["id"], LucideIcon>;

export function AudienceIntentFieldsV61({selected, disabled=false, onChange}: {
  selected: readonly SitePlanningAudienceId[];
  disabled?: boolean;
  onChange: (id: SitePlanningAudienceId, checked: boolean) => void;
}) {
  return <fieldset className="space-y-4">
          <legend className="sr-only">Audiences you desire to serve (optional)</legend>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Select all that apply. Optional.</span>
            <span role="status" aria-label="Audience selection count">{selected.length} selected</span>
          </div>
          {siteAudienceGroups.map(group=>{
            const Icon=audienceIcons[group.id];
            return <fieldset key={group.id} className="space-y-2 border-b pb-3 last:border-0">
              <legend className="flex items-center gap-2 text-sm font-semibold">
                <Icon className="size-4 text-muted-foreground" aria-hidden="true"/>{group.label}
              </legend>
              <SelectionChipGroup>
                {group.items.map(item=><SelectionChip key={item.id} selected={selected.includes(item.id)}
                  disabled={disabled} onChange={checked=>onChange(item.id,checked)}>{item.label}</SelectionChip>)}
              </SelectionChipGroup>
            </fieldset>;
          })}
          <WorkspaceNotice tone="info">Your selections express your aspirations, not current capabilities or commitments to deliver programs.</WorkspaceNotice>
        </fieldset>;
}

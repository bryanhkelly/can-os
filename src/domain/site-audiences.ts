/** Canonical Site-level declared audience intent, not participant attributes or eligibility. */
export const sitePlanningAudienceIds = ["early_childhood","children","teens","college_students","young_adults","adults","older_adults","families","parents","single_parents","caregivers","foster_families","low_income_households","homelessness","housing_insecure","unemployed","immigrants","refugees","newcomers","english_language_learners","veterans","military_families","justice_impacted","foster_youth","disconnected_youth","disabilities","rural_communities","underserved_communities","digitally_underserved"] as const;
export type SitePlanningAudienceId = typeof sitePlanningAudienceIds[number];
export const siteAudienceGroups = [
  {
    "id": "age_and_life_stage",
    "label": "Age & life stage",
    "items": [
      {
        "id": "early_childhood",
        "label": "Early childhood"
      },
      {
        "id": "children",
        "label": "Children"
      },
      {
        "id": "teens",
        "label": "Teens"
      },
      {
        "id": "college_students",
        "label": "College students"
      },
      {
        "id": "young_adults",
        "label": "Young adults"
      },
      {
        "id": "adults",
        "label": "Adults"
      },
      {
        "id": "older_adults",
        "label": "Older adults"
      }
    ]
  },
  {
    "id": "families_and_caregivers",
    "label": "Families & caregivers",
    "items": [
      {
        "id": "families",
        "label": "Families"
      },
      {
        "id": "parents",
        "label": "Parents"
      },
      {
        "id": "single_parents",
        "label": "Single parents"
      },
      {
        "id": "caregivers",
        "label": "Caregivers"
      },
      {
        "id": "foster_families",
        "label": "Foster families"
      }
    ]
  },
  {
    "id": "economic_and_housing",
    "label": "Economic & housing circumstances",
    "items": [
      {
        "id": "low_income_households",
        "label": "Low-income households"
      },
      {
        "id": "homelessness",
        "label": "People experiencing homelessness"
      },
      {
        "id": "housing_insecure",
        "label": "Housing-insecure families"
      },
      {
        "id": "unemployed",
        "label": "Unemployed individuals"
      }
    ]
  },
  {
    "id": "immigration_and_language",
    "label": "Immigration & language",
    "items": [
      {
        "id": "immigrants",
        "label": "Immigrants"
      },
      {
        "id": "refugees",
        "label": "Refugees"
      },
      {
        "id": "newcomers",
        "label": "Newcomers"
      },
      {
        "id": "english_language_learners",
        "label": "English language learners"
      }
    ]
  },
  {
    "id": "life_circumstances",
    "label": "Life circumstances",
    "items": [
      {
        "id": "veterans",
        "label": "Veterans"
      },
      {
        "id": "military_families",
        "label": "Military families"
      },
      {
        "id": "justice_impacted",
        "label": "Justice-impacted individuals"
      },
      {
        "id": "foster_youth",
        "label": "Foster youth"
      },
      {
        "id": "disconnected_youth",
        "label": "Disconnected youth"
      }
    ]
  },
  {
    "id": "access_and_inclusion",
    "label": "Access & inclusion",
    "items": [
      {
        "id": "disabilities",
        "label": "People with disabilities"
      },
      {
        "id": "rural_communities",
        "label": "Rural communities"
      },
      {
        "id": "underserved_communities",
        "label": "Underserved communities"
      },
      {
        "id": "digitally_underserved",
        "label": "Digitally underserved"
      }
    ]
  }
] as const;
export const siteAudienceNames = Object.fromEntries(siteAudienceGroups.flatMap(group =>
  group.items.map(item => [item.id, item.label]))) as Record<SitePlanningAudienceId,string>;
export function projectSiteAudienceIntent(ids: readonly SitePlanningAudienceId[]) {
  return { classification: "declared_desire" as const,
    audiences: siteAudienceGroups.flatMap(group => group.items
      .filter(item => ids.includes(item.id))
      .map(item => ({id:item.id,label:item.label,category:group.id}))),
    deliveryCapacityVerified: false as const };
}

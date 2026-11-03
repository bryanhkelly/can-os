/**
 * Valor's explicit, fictional website-review scenario.
 *
 * This is VISUAL QA DATA, not a live Site edit or an institutional statement.
 * Do not write this file into production Neon or treat its text as approval.
 * The production Site's versioned church content must be published through
 * publishPartnerLocalContent by a verified Site website editor.
 */
export const valorReferenceSchool = {
  key: "valor",
  host: "valorschool.can-os.com",
  site: {
    name: "Valor School",
    organizationName: "CAN Synthetic Demonstration School",
  },
  localContent: {
    welcomeMessage: "A fictional example of learning rooted in community, curiosity, and purpose.",
    localDescription: "Valor is a synthetic reference school used to demonstrate how a local partner and CAN Academy might create a thoughtful school experience. This sample describes a possible vision; it is not evidence of an operating campus, a specific church partnership, or actual services.",
    denomination: "",
    statementOfFaith: "",
    spiritualFormation: "Illustrative concept: space for service, reflection, and community connections, subject to local partner choices and separate program approval.",
    churchHistory: "No real host-church history is asserted in this demonstration. A participating church would review and publish its own story and traditions.",
    communityOutreach: "Illustrative concept: learning that connects students to the people and needs of their own neighborhood. Specific service activities would require separate planning and safeguarding review.",
    schoolVision: "Help families imagine a connected educational experience in which local relationships complement institutionally approved academics.",
    leadershipWelcome: "This is an illustrative school website. Leadership names, credentials, and welcomes will appear only when approved for publication.",
    localTraditions: "Sample ideas for discussion include community gatherings, student showcases, and supervised service projects. These are not scheduled events.",
    branding: {
      theme: "classic",
      paletteId: "heritage",
      typographyId: "editorial",
      heroImage: null,
    },
  },
  academicPrograms: [{
    programId: "f1000000-0000-4000-8000-000000000004",
    title: "Synthetic Hybrid High School",
    typeLabel: "High school extension",
    summary: "A synthetic Grade 9–12 hybrid learning example. Publication is for demonstration, not a commitment that the school is authorized to open or enroll students.",
    grades: { min: "9", max: "12" },
    delivery: {
      onsite: true,
      liveOnline: true,
      asynchronous: true,
      onsiteDaysPerWeek: null,
    },
    availability: "planned",
    applicationOpen: false,
  }],
  offerings: [],
};

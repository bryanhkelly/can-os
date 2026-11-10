/**
 * Valor's creative-direction sample: original fictional content and programs.
 * This file is test/visual-fixture data, not a live Site revision.
 * The shared renderer displays a visible demo notice for this scenario.
 *
 * Any real publication must go through the canonical Site website editor,
 * including authorization, revisioning, rights checks and claim screening.
 */
export const valorReferenceSchool = {
  key: "valor",
  demonstration: true,
  host: "valorschool.can-os.com",
  site: {
    name: "Valor School",
    organizationName: "CAN Synthetic Demonstration School",
  },
  localContent: {
    welcomeMessage: "Small-school connection. Big-world possibility.",
    localDescription: "At Valor, we imagine a school where students are known by name, ideas are taken seriously, and learning reaches beyond the screen. This fictional campus brings together the energy of a neighborhood learning community with a thoughtfully designed hybrid academic experience.",
    denomination: "",
    statementOfFaith: "",
    spiritualFormation: "Faith and purpose shape our sample community through reflection, meaningful conversation, and opportunities to serve. The activities pictured here are illustrative concepts, not scheduled ministry services.",
    churchHistory: "Valor began as a design question: what would a school feel like if every young person had a place to belong, room to think independently, and adults who noticed their potential? Our fictional story imagines a school growing from that conviction.",
    communityOutreach: "Learning comes alive when it meets the community. Sample student projects connect design, technology, local history, and service—from mapping neighborhood resources to exploring the science behind everyday problems.",
    schoolVision: "Curious minds. Courageous hearts. A community that sees what each student can become. Our vision is a high-school experience that pairs rigorous learning with genuine connection and a sense of purpose.",
    leadershipWelcome: "Welcome to Valor. We're building a picture of a school experience where curiosity is celebrated, questions matter, and every student has the opportunity to contribute. We're glad you're exploring what that could look like.",
    localTraditions: "Imagine Friday showcases, student-led exhibitions, service Saturdays, and family gatherings that make learning visible. These are sample traditions for this demonstration, not confirmed calendar events.",
    branding: {
      theme: "classic",
      paletteId: "heritage",
      typographyId: "editorial",
      heroImage: null,
    },
  },
  academicPrograms: [{
    programId: "f1000000-0000-4000-8000-000000000004",
    title: "Valor Hybrid High School",
    typeLabel: "Grades 9–12",
    summary: "A sample high-school pathway combining on-site collaboration, live online teaching, and independent study. Explore how connection and flexibility can work together.",
    grades: { min: "9", max: "12" },
    delivery: {
      onsite: true,
      liveOnline: true,
      asynchronous: true,
      onsiteDaysPerWeek: null,
    },
    availability: "operating",
    applicationOpen: true,
  }],
  // Illustrative, explicitly not registration-open; no production Activity or
  // Season state is created from these fictional examples.
  offerings: [
    { seasonId:"demo-robotics", title:"Robotics & Design Lab",
      programName:"STEM Studio", season:"Illustrative fall program",
      startsOn:"2027-09-08", endsOn:"2027-11-17",
      feeAmountCents:0, seatsRemaining:null, registrationOpen:false,
      firstMeeting:null, meetingTimezone:null, packages:[] },
    { seasonId:"demo-arts", title:"The Creative Collective",
      programName:"Arts & Expression", season:"Illustrative fall program",
      startsOn:"2027-09-09", endsOn:"2027-11-18",
      feeAmountCents:0, seatsRemaining:null, registrationOpen:false,
      firstMeeting:null, meetingTimezone:null, packages:[] },
    { seasonId:"demo-service", title:"Neighborhood Impact",
      programName:"Service & Leadership", season:"Illustrative fall program",
      startsOn:"2027-09-11", endsOn:"2027-11-20",
      feeAmountCents:0, seatsRemaining:null, registrationOpen:false,
      firstMeeting:null, meetingTimezone:null, packages:[] },
  ],
};

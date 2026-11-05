/**
 * Public Engagement Framework.
 *
 * Single canonical CAN OS journey registry, shared by public landing and
 * Next Steps UI. Actual school, family, and staff authority stays in
 * the existing server-verified Launch Studio and domain services.
 *
 * Optional video keys are editorial references for a future integration.
 * They do not imply a player, remote fetch, media upload or admin console.
 */
export type JourneyId =
  | 'start-a-school'
  | 'teach-with-can'
  | 'family-admissions'
  | 'school-expansion'
  | 'church-networks'

export type JourneyChoice = {
  id: string
  title: string
  description: string
  action: 'conversation' | 'information' | 'feedback'
  topic?: string
  href?: string
}

export type EngagementJourney = {
  id: JourneyId
  audience: string
  category: 'church' | 'teacher' | 'family' | 'school' | 'network'
  eyebrow: string
  headline: string
  introduction: string
  image: string
  imageAlt: string
  promise: string
  overviewTitle: string
  overview: readonly { title: string; description: string }[]
  reality: string
  editorialLinks: readonly { title: string; href: string }[]
  /** Canonical, server-authorized CAN OS route for EXISTING, verified users. */
  launch: {
    path: '/launch/school' | '/launch/staff' | '/launch/family'
    description: string
    label: string
  } | null
  next: {
    title: string
    description: string
    choices: readonly JourneyChoice[]
  }
  /** Future optional leadership content slots. No video assets are configured. */
  guidance?: {
    landing?: string
    experience?: string
    next?: string
  }
}

export const engagementJourneys: Record<JourneyId, EngagementJourney> = {
  'start-a-school': {
    id: 'start-a-school',
    audience: 'Pastors and church leaders',
    category: 'church',
    eyebrow: 'Explore a school at your church',
    headline: 'What could a school at your church look like?',
    introduction: 'Your church already knows its community. Explore how shared academic infrastructure and trusted local relationships might create more educational possibilities.',
    image: '/images/roles/02_churches_ministries.png',
    imageAlt: 'Church and ministry leaders in conversation',
    promise: 'An invitation to explore, not a commitment to operate a school.',
    overviewTitle: 'From possibility to a practical conversation',
    overview: [
      { title: 'Imagine the opportunity', description: 'Consider the students, grade levels, local relationships and facilities that may shape a school.' },
      { title: 'Understand the responsibilities', description: 'Learn how shared curriculum, recorded instruction and academic support could work alongside local supervision and community leadership.' },
      { title: 'Explore what comes next', description: 'Identify questions about viability, staffing, student needs, funding and the steps required for a responsible launch.' },
    ],
    reality: 'Exploration does not establish an approved school, legal authorization, confirmed state funding, enrollment availability or a partnership agreement.',
    editorialLinks: [
      { title: 'How a partnership could work', href: '/partnership-model' },
      { title: 'Explore school economics', href: '/economic-breakthrough' },
      { title: 'Understand the launch approach', href: '/launch-approach' },
    ],
    launch: { path: '/launch/school', label: 'Continue in School Launch Studio',
      description: 'Already authorized as a CAN school administrator? Continue your existing school setup with your verified account.' },
    next: {
      title: 'Your school could start with a conversation.',
      description: 'You do not need to decide today. Tell us what would be most helpful for your church to explore next.',
      choices: [
        { id: 'learn-more', title: 'I am curious and want to learn more', description: 'Explore the partnership model and ask your questions.', action: 'information', href: '/partnership-model' },
        { id: 'church-conversation', title: 'I would like to discuss this for my church', description: 'Share the opportunity you are considering.', action: 'conversation', topic: 'school-partnership' },
        { id: 'costs-funding', title: 'I want to understand costs, enrollment and funding', description: 'Start a focused financial-viability conversation.', action: 'conversation', topic: 'economics' },
        { id: 'serious-interest', title: 'We may be ready to explore a school launch', description: 'Discuss the responsible steps toward a formal partnership.', action: 'conversation', topic: 'launch-readiness' },
        { id: 'share-feedback', title: 'I just want to share feedback', description: 'Tell us what resonates or what still concerns you, without providing contact details.', action: 'feedback' },
      ],
    },
    guidance: { landing: 'school-opportunity-intro', experience: 'school-launch-welcome', next: 'school-next-steps' },
  },
  'teach-with-can': {
    id: 'teach-with-can',
    audience: 'Prospective teachers',
    category: 'teacher',
    eyebrow: 'Teaching and academic careers',
    headline: 'Bring your expertise to more learners.',
    introduction: 'Explore a teaching model in which educators can develop excellent instructional content while students receive responsive academic support and meaningful local relationships.',
    image: '/images/03_curriculum_student_study.png',
    imageAlt: 'Student engaging with academic learning materials',
    promise: 'Learn about the model before discussing teaching opportunities.',
    overviewTitle: 'What teaching with CAN may involve',
    overview: [
      { title: 'Instructional craftsmanship', description: 'Learn about teacher-created lessons, curriculum, assessment and the role of recorded academic instruction.' },
      { title: 'Support when students need it', description: 'Understand the separate roles of teachers, tutors, academic coaches and local room facilitators.' },
      { title: 'A careful application process', description: 'Discuss role availability and qualifications before beginning any verified staff or employment process.' },
    ],
    reality: 'This page is for recruitment interest. It is not a job posting, employment offer or staff application. Actual positions, eligibility and hiring decisions require separate verification.',
    editorialLinks: [
      { title: 'How learning works', href: '/academics/how-learning-works' },
      { title: 'Teachers and student support', href: '/academics/teachers-and-support' },
      { title: 'Meet CAN leadership', href: '/leadership' },
    ],
    launch: { path: '/launch/staff', label: 'Continue existing staff onboarding',
      description: 'Already a verified CAN staff member? Continue your assigned onboarding. Prospective teachers should contact the team first.' },
    next: {
      title: 'Where would you like to take your teaching?',
      description: 'Tell us what interests you. A conversation is not an employment application or offer.',
      choices: [
        { id: 'teach-interest', title: 'I would like to discuss teaching opportunities', description: 'Introduce your instructional interests and experience.', action: 'conversation', topic: 'teacher-recruitment' },
        { id: 'teaching-model', title: 'Help me understand how teaching works', description: 'Learn how recorded lessons and academic support fit together.', action: 'information', href: '/academics/teachers-and-support' },
        { id: 'qualifications', title: 'I have questions about qualifications or roles', description: 'Ask about the process before sharing credentials.', action: 'conversation', topic: 'teacher-qualifications' },
        { id: 'share-feedback', title: 'I would like to share feedback', description: 'Help us improve the explanation of the teaching model.', action: 'feedback' },
      ],
    },
    guidance: { landing: 'teacher-recruitment-intro', experience: 'teacher-welcome', next: 'teacher-next-steps' },
  },
  'family-admissions': {
    id: 'family-admissions',
    audience: 'Parents and guardians',
    category: 'family',
    eyebrow: 'Explore CAN with your family',
    headline: 'A meaningful education begins with knowing your child.',
    introduction: 'Learn how CAN is designing strong academics, local relationships and support. Discover what families should ask before considering a school or program.',
    image: '/images/roles/01_families.png',
    imageAlt: 'Parent considering educational options for their child',
    promise: 'Explore the model without submitting an application or student records.',
    overviewTitle: 'Find the answers that matter for your family',
    overview: [
      { title: 'Learning and belonging', description: 'See how students could combine teacher-created instruction with local community and responsive academic support.' },
      { title: 'Your school options', description: 'Check program, location and opening information through verified school publications when available.' },
      { title: 'The right next step', description: 'Ask a question, start an authorized inquiry or resume an existing application when appropriate.' },
    ],
    reality: 'Exploring CAN does not reserve a seat or indicate that a particular school accepts applications. Verified program and admissions information controls actual enrollment steps.',
    editorialLinks: [
      { title: 'Student experience', href: '/student-experience' },
      { title: 'Academics', href: '/academics' },
      { title: 'Locations and launch status', href: '/locations' },
    ],
    launch: { path: '/launch/family', label: 'Continue your family journey',
      description: 'Already invited or verified by a participating school? Return to the existing family journey. Do not begin with student records on this public page.' },
    next: {
      title: 'Find the next step for your family.',
      description: 'Every family and school situation is different. Begin with what you need to understand.',
      choices: [
        { id: 'find-school', title: 'I want to explore schools and locations', description: 'See locations and published launch information.', action: 'information', href: '/locations' },
        { id: 'admissions-question', title: 'I have a question about admissions', description: 'Ask about a school or available process.', action: 'conversation', topic: 'family-admissions' },
        { id: 'learning-question', title: 'I want to understand learning and support', description: 'Explore the educational model in depth.', action: 'information', href: '/academics/how-learning-works' },
        { id: 'share-feedback', title: 'I would like to share feedback', description: 'Tell CAN what families need to know.', action: 'feedback' },
      ],
    },
    guidance: { landing: 'family-opportunity-intro', experience: 'family-welcome', next: 'family-next-steps' },
  },
  'school-expansion': {
    id: 'school-expansion',
    audience: 'Christian school leaders',
    category: 'school',
    eyebrow: 'Extend an existing Christian school',
    headline: "Let your school's next chapter grow from its strengths.",
    introduction: 'What if a trusted Christian school could offer additional grades and academic options without independently rebuilding every course, teacher role and system?',
    image: '/images/roles/03_school_leaders.png',
    imageAlt: 'School leaders discussing educational opportunities',
    promise: 'Consider an extension before committing to a new program or staffing model.',
    overviewTitle: 'A responsible path toward more opportunity',
    overview: [
      { title: 'Preserve your identity', description: 'Consider how your school community, mission and leadership remain central.' },
      { title: 'Explore shared capabilities', description: 'Understand how CAN academic content, systems and student support could complement a local school.' },
      { title: 'Review practical constraints', description: 'Discuss grade-level demand, staffing, finance, records and authorization requirements.' },
    ],
    reality: 'No grade extension, accreditation, funding participation, or school authorization is assumed. Formal programs require verified school and jurisdiction decisions.',
    editorialLinks: [
      { title: 'Partnership model', href: '/partnership-model' },
      { title: 'Academic pathways', href: '/academics/pathways' },
      { title: 'Launch approach', href: '/launch-approach' },
    ],
    launch: { path: '/launch/school', label: 'Continue verified school setup',
      description: 'Already have a verified CAN Site role? Continue its existing school launch or expansion work.' },
    next: {
      title: 'What would be worth exploring with your school?',
      description: 'A conversation can clarify what an expansion might require.',
      choices: [
        { id: 'extension', title: 'I want to discuss adding grades or programs', description: 'Discuss a potential extension and its requirements.', action: 'conversation', topic: 'school-expansion' },
        { id: 'model', title: 'I want to understand the shared model', description: 'Review CAN partnership responsibilities.', action: 'information', href: '/partnership-model/shared-responsibilities' },
        { id: 'feasibility', title: 'I want to evaluate financial and operational feasibility', description: 'Discuss assumptions and outstanding questions.', action: 'conversation', topic: 'expansion-feasibility' },
        { id: 'share-feedback', title: 'I would like to share feedback', description: 'Tell us what would help existing schools most.', action: 'feedback' },
      ],
    },
  },
  'church-networks': {
    id: 'church-networks',
    audience: 'Denominations and church networks',
    category: 'network',
    eyebrow: 'Christian education across a network',
    headline: 'What could many local churches make possible together?',
    introduction: 'Explore the possibility of shared academic infrastructure supporting distinct churches, with local identity and relationships remaining central.',
    image: '/images/roles/05_denominations_networks.png',
    imageAlt: 'Community leaders considering a church network education model',
    promise: 'Explore network possibilities without implying committed or authorized sites.',
    overviewTitle: 'Consider the network opportunity',
    overview: [
      { title: 'Start with the churches', description: 'Understand which communities have interest, space, capacity and potential school leadership.' },
      { title: 'Explore the shared model', description: 'Learn which instructional and operational resources could be shared across sites.' },
      { title: 'Assess a possible pilot', description: 'Discuss participation, governance, demand and evidence requirements before a formal network decision.' },
    ],
    reality: 'Network exploration is not a denominational endorsement, site commitment, agreement or verified school-opening plan.',
    editorialLinks: [
      { title: 'Denominations and networks', href: '/denominations' },
      { title: 'Shared responsibilities', href: '/partnership-model/shared-responsibilities' },
      { title: 'Accountability', href: '/accountability' },
    ],
    launch: null,
    next: {
      title: 'What would your network like to explore?',
      description: 'Begin with a practical question and the scope of a possible conversation.',
      choices: [
        { id: 'pilot', title: 'I would like to discuss a network pilot', description: 'Explore an initial set of churches and decision-makers.', action: 'conversation', topic: 'network-pilot' },
        { id: 'governance', title: 'I want to understand governance and responsibilities', description: 'Review who manages which parts of the school experience.', action: 'information', href: '/partnership-model/governance-and-accountability' },
        { id: 'leadership', title: 'I would like to introduce CAN to network leadership', description: 'Start a conversation with your network context.', action: 'conversation', topic: 'network-leadership' },
        { id: 'share-feedback', title: 'I would like to share feedback', description: 'Tell us what would make this model useful to a network.', action: 'feedback' },
      ],
    },
  },
}

export const engagementJourneyList = Object.values(engagementJourneys)
export function getEngagementJourney(id: string | undefined): EngagementJourney | null {
  return id && Object.hasOwn(engagementJourneys, id)
    ? engagementJourneys[id as JourneyId]
    : null
}


/** Context-aware follow-up pages intentionally never claim completion of the
 * canonical Launch Studio workflow. They are safe to visit at any time. */
export function engagementDestination(id: JourneyId, stage: "landing"|"next"): string {
  return `/${stage}/${id}`;
}

/** Public introduction may not grant authorization to the verified journeys. */
export function mayTryIsolatedSchoolDemo(id: JourneyId): boolean {
  return id === "start-a-school" || id === "school-expansion";
}

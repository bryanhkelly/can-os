export type StudentWork = {
  id: string;
  course: string;
  courseCode: string;
  title: string;
  detail: string;
  due: string;
  dueLabel: string;
  duration: number;
  status: "assigned" | "missing" | "submitted" | "graded";
  grade?: number;
  feedback?: string;
  nextStep?: string;
  kind: "assignment" | "revision" | "practice";
};
export type StudentMoment = {
  id: string;
  time: string;
  title: string;
  subtitle: string;
  kind: "class" | "live" | "formation" | "mentor";
  state?: "cancelled" | "moved";
};

export const demoStudent = {
  displayName: "Jordan",
  site: "CAN Academy · Local Campus",
  onTrack: 4,
  courseCount: 5,
  moments: [
    { id: "m1", time: "8:30", title: "Algebra II", subtitle: "Learning studio · Room 2", kind: "class" },
    { id: "m2", time: "10:00", title: "English Literature", subtitle: "Live online · Join classroom", kind: "live" },
    { id: "m3", time: "12:15", title: "Chapel & reflection", subtitle: "Main gathering space", kind: "formation" },
    { id: "m4", time: "14:30", title: "Mentor check-in", subtitle: "With Ms. Rivera · 15 min", kind: "mentor" },
  ] satisfies StudentMoment[],
  work: [
    {
      id: "a1", course: "Biology", courseCode: "BIO-101", title: "Cell structure lab report",
      detail: "Explain the results of your observation and include two labeled diagrams.",
      due: "2026-10-15T15:00:00", dueLabel: "Today · 3:00 PM", duration: 25,
      status: "assigned", kind: "assignment",
    },
    {
      id: "a2", course: "English Literature", courseCode: "ENG-201", title: "Revise your personal essay",
      detail: "Strengthen the opening argument using your teacher's feedback.",
      due: "2026-10-16T17:00:00", dueLabel: "Tomorrow · 5:00 PM", duration: 20,
      status: "missing", kind: "revision", grade: 68,
      feedback: "You have a compelling perspective. Your thesis needs to be clearer, and paragraph two needs evidence.",
      nextStep: "Rewrite the thesis and add one supporting example. You can resubmit.",
    },
    {
      id: "a3", course: "Algebra II", courseCode: "MATH-201", title: "Quadratic functions check",
      detail: "Practice factoring, graphs, and identifying intercepts.",
      due: "2026-10-17T16:00:00", dueLabel: "Saturday · 4:00 PM", duration: 15,
      status: "graded", kind: "practice", grade: 74,
      feedback: "Good work on intercepts. Focus your practice on completing the square.",
      nextStep: "Complete the short practice set, then try the check again.",
    },
    {
      id: "a4", course: "World History", courseCode: "HIST-102", title: "Primary-source reflection",
      detail: "Respond to the historical document with two observations and one question.",
      due: "2026-10-15T17:00:00", dueLabel: "Today · 5:00 PM", duration: 15,
      status: "submitted", kind: "assignment",
    },
  ] satisfies StudentWork[],
};

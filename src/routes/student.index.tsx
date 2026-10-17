import { createFileRoute } from "@tanstack/react-router";
import { StudentExperience } from "@/components/student/StudentExperience";
import { getMyStudentToday } from "@/modules/student-experience/student-today.functions";
import { safeLoader } from "@/lib/safe-loader";
import { LoaderFailure } from "@/lib/loader-failure";

export const Route = createFileRoute("/student/")({
  loader: safeLoader(() => getMyStudentToday(), {
    authMessage: "Sign in with an enrolled student account to see your learning day.",
  }),
  component: StudentTodayPage,
});
function StudentTodayPage() {
  const result = Route.useLoaderData();
  if (!result.ok) return <LoaderFailure eyebrow="CAN OS · Student" title="Your learning day" outcome={result} />;
  return <StudentExperience liveData={result.data} />;
}

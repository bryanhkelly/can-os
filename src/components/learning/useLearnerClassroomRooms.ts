import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getLearnerFacilitatedRoom } from "@/modules/learning/facilitated-learning.functions";

/** One authorization-aware room query shared by all learner classroom surfaces.
 * Never infer attendance from pairing, cache state or device connectivity. */
export const learnerRoomQueryKey = (courseAttemptId: string) =>
  ["native-class-companion", courseAttemptId] as const;

export function useLearnerClassroomRooms(courseAttemptId: string) {
  return useQuery({
    queryKey: learnerRoomQueryKey(courseAttemptId),
    queryFn: () => getLearnerFacilitatedRoom({ data: { courseAttemptId } }),
    enabled: Boolean(courseAttemptId),
    staleTime: 0,
    refetchInterval: 8000,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    retry: false,
    // Never keep showing stale room data when a newly revalidated identity is denied.
    placeholderData: undefined,
  });
}

export function useRefreshLearnerClassroomRooms() {
  const client = useQueryClient();
  return (courseAttemptId: string) =>
    client.invalidateQueries({ queryKey: learnerRoomQueryKey(courseAttemptId) });
}

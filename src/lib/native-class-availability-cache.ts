import type { QueryClient } from "@tanstack/react-query";

/**
 * Class creation depends on publisher Course publication and independently
 * approved local adoption. Keep the query SHAPES distinct (infinite manager
 * pages vs. a single Launch Studio page), but invalidate them together when
 * either authority changes. The server rechecks every Site/Person permission.
 */
export const nativeClassAvailabilityQueryKeys = {
  managerPages: ["native-class-course-options"] as const,
  rolloutPages: ["native-class-rollout-options"] as const,
  launchPage: ["launch-class-course-adoptions"] as const,
};

/** Never repeat an approval command simply because its dependent reads failed. */
export async function invalidateNativeClassAvailability(client: QueryClient): Promise<void> {
  await Promise.all(Object.values(nativeClassAvailabilityQueryKeys).map(queryKey =>
    client.invalidateQueries({ queryKey }, { throwOnError: true }),
  ));
}

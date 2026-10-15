import { describe, expect, it } from "vitest";
import { seedTasks, seedEvents, seedFeed, seedMilestones } from "@/components/student/StudentQuickWins";

describe("Synthetic student quick win scenarios", () => {
  it("provides deterministic, unique IDs for every released scenario", () => {
    for (const collection of [seedTasks, seedEvents, seedFeed, seedMilestones]) {
      expect(collection.length).toBeGreaterThan(0);
      expect(new Set(collection.map(item => item.id)).size).toBe(collection.length);
    }
  });
  it("covers missing, completed, permission, and support actions", () => {
    expect(seedTasks.some(item => item.state === "done")).toBe(true);
    expect(seedTasks.some(item => item.state === "open")).toBe(true);
    expect(seedTasks.some(item => item.kind === "consent")).toBe(true);
    expect(seedTasks.some(item => item.title.toLowerCase().includes("support"))).toBe(true);
  });
  it("fuses academic, activity, and meeting moments", () => {
    const categories = new Set(seedEvents.map(item => item.category));
    expect(categories).toEqual(new Set(["school","activity","meeting"]));
    expect(seedEvents.every(item => item.status === "scheduled")).toBe(true);
  });
  it("has both local-site and network communication", () => {
    expect(new Set(seedFeed.map(item => item.audience))).toEqual(new Set(["site","network"]));
  });
});

/**
 * Full application integration test against the digital twin (dtu-peloton).
 *
 * Tests the complete app business logic — PelotonClient methods, FTP history
 * chain walking, stack sync, and search — exactly as the API routes use them.
 * The only thing bypassed is Supabase auth (which the DTU doesn't need).
 *
 * Run standalone:  npx vitest run src/lib/peloton/app.integration.test.ts
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { server } from "@/test/setup";

// Set env vars BEFORE PelotonClient module is loaded.
// vi.hoisted runs before any imports are evaluated.
vi.hoisted(() => {
  process.env.PELOTON_API_URL = "http://localhost:4201";
  process.env.PELOTON_GRAPHQL_URL = "http://localhost:4201/graphql";
});

// Now import client — it will pick up the env vars above
import { PelotonClient } from "./client";
import { getStackStatus } from "./stack-sync";

// Ride IDs from seed.json
const RIDE_METAL_30 = "b2d6ae5708fa4344ab2703201fd0e893";
const RIDE_POP_30 = "5566778899aabb5566778899aabb5566";
const RIDE_EDM_30 = "c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0";
const RIDE_HIIT_RUN = "923a0be458c449ffac3a589ba8aa1c63";
const RIDE_TABATA = "e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6";

let matt: PelotonClient;
let jane: PelotonClient;

beforeAll(() => {
  server.close();
  matt = new PelotonClient("test-token-matt");
  jane = new PelotonClient("test-token-jane");
});

afterAll(async () => {
  await matt.clearStackGraphQL();
  await jane.clearStackGraphQL();
  delete process.env.PELOTON_API_URL;
  delete process.env.PELOTON_GRAPHQL_URL;
  server.listen({ onUnhandledRequest: "bypass" });
});

describe("Full App Integration", () => {
  // =========================================================================
  // 1. User Profile (PelotonClient.getMe)
  // =========================================================================
  describe("User Profile — getMe()", () => {
    it("Matt: profile matches seed.sql values", async () => {
      const user = await matt.getMe();
      expect(user.id).toBe("48bcbd2444f744138043812a9420bbe0");
      expect(user.username).toBe("lightcap");
      expect(user.cycling_ftp).toBe(267);
      expect(user.estimated_cycling_ftp).toBe(270);
      expect(user.cycling_ftp_workout_id).toBe("4e77e9a27f074a509fe08d4eb41e6b36");
    });

    it("Jane: profile matches seed.sql values", async () => {
      const user = await jane.getMe();
      expect(user.id).toBe("fake_peloton_user_002");
      expect(user.username).toBe("jane_rides");
      expect(user.cycling_ftp).toBe(195);
      expect(user.estimated_cycling_ftp).toBe(200);
    });
  });

  // =========================================================================
  // 2. FTP History — getFtpHistory() chain walk
  // =========================================================================
  describe("FTP History — getFtpHistory()", () => {
    it("Matt: walks full chain and calculates correct FTP values", async () => {
      const user = await matt.getMe();
      const history = await matt.getFtpHistory(user.cycling_ftp_workout_id!);

      expect(history).toHaveLength(2);

      // Most recent: avg_output=281, FTP=267, baseline=219
      expect(history[0].workoutId).toBe("4e77e9a27f074a509fe08d4eb41e6b36");
      expect(history[0].avgOutput).toBe(281);
      expect(history[0].calculatedFtp).toBe(267); // 281 * 0.95 = 266.95 → 267
      expect(history[0].baselineFtp).toBe(219);
      expect(history[0].rideTitle).toBe("20 min FTP Test Ride");

      // First test: avg_output=231, FTP=219, baseline=208
      expect(history[1].workoutId).toBe("096f513cf5914c0f8eef81c870e4779c");
      expect(history[1].avgOutput).toBe(231);
      expect(history[1].calculatedFtp).toBe(219); // 231 * 0.95 = 219.45 → 219
      expect(history[1].baselineFtp).toBe(208);
    });

    it("Jane: walks full chain with 2 FTP tests", async () => {
      const user = await jane.getMe();
      const history = await jane.getFtpHistory(user.cycling_ftp_workout_id!);

      expect(history).toHaveLength(2);

      // Most recent: avg_output=205, FTP=195, baseline=180
      expect(history[0].avgOutput).toBe(205);
      expect(history[0].calculatedFtp).toBe(195); // 205 * 0.95 = 194.75 → 195
      expect(history[0].baselineFtp).toBe(180);

      // First: avg_output=189, FTP=180, baseline=0
      expect(history[1].avgOutput).toBe(189);
      expect(history[1].calculatedFtp).toBe(180); // 189 * 0.95 = 179.55 → 180
      expect(history[1].baselineFtp).toBe(0);
    });

    it("user.cycling_ftp equals calculated FTP from most recent test", async () => {
      const user = await matt.getMe();
      const history = await matt.getFtpHistory(user.cycling_ftp_workout_id!);
      expect(user.cycling_ftp).toBe(history[0].calculatedFtp);
    });
  });

  // =========================================================================
  // 3. Search — searchRides()
  // =========================================================================
  describe("Search — searchRides()", () => {
    it("returns all rides with default params", async () => {
      const results = await matt.searchRides({ limit: 50 });
      expect(results.total).toBe(26);
      expect(results.data.length).toBe(26);
    });

    it("filters by fitness_discipline", async () => {
      const cycling = await matt.searchRides({ fitness_discipline: "cycling" });
      expect(cycling.data.length).toBeGreaterThan(0);
      for (const ride of cycling.data) {
        expect(ride.fitness_discipline).toBe("cycling");
      }

      const running = await matt.searchRides({ fitness_discipline: "running" });
      expect(running.data.length).toBeGreaterThan(0);
      for (const ride of running.data) {
        expect(ride.fitness_discipline).toBe("running");
      }

      const strength = await matt.searchRides({ fitness_discipline: "strength" });
      expect(strength.data.length).toBeGreaterThan(0);
      for (const ride of strength.data) {
        expect(ride.fitness_discipline).toBe("strength");
      }
    });

    it("filters by duration (array format)", async () => {
      const results = await matt.searchRides({ duration: [1800] });
      expect(results.data.length).toBeGreaterThan(0);
      for (const ride of results.data) {
        expect(ride.duration).toBe(1800);
      }
    });

    it("filters by instructor_id", async () => {
      const alexId = "1697e6f580494740a5a1ca62b8b3f47c";
      const results = await matt.searchRides({ instructor_id: alexId });
      expect(results.data.length).toBeGreaterThan(0);
      for (const ride of results.data) {
        expect(ride.instructor_id).toBe(alexId);
      }
    });

    it("paginates correctly", async () => {
      const page0 = await matt.searchRides({ limit: 5, page: 0 });
      const page1 = await matt.searchRides({ limit: 5, page: 1 });

      expect(page0.data).toHaveLength(5);
      expect(page1.data).toHaveLength(5);
      expect(page0.total).toBe(26);

      // Pages should have different rides
      const ids0 = new Set(page0.data.map(r => r.id));
      const ids1 = new Set(page1.data.map(r => r.id));
      for (const id of ids1) {
        expect(ids0.has(id)).toBe(false);
      }
    });

    it("includes instructor data in results", async () => {
      const results = await matt.searchRides({ fitness_discipline: "cycling", limit: 5 });
      for (const ride of results.data) {
        expect(ride.instructor_id).toBeTruthy();
        expect(ride.instructor).toBeDefined();
        expect(ride.instructor!.name).toBeTruthy();
      }
    });
  });

  // =========================================================================
  // 4. Stack — GraphQL mutations (modifyStack, addClassToStack, viewStack)
  // =========================================================================
  describe("Stack — GraphQL operations", () => {
    it("starts with empty stack", async () => {
      const stack = await matt.viewUserStackGraphQL();
      expect(stack).not.toBeNull();
      expect(stack!.numClasses).toBe(0);
    });

    it("addClassToStackGraphQL adds a ride", async () => {
      const result = await matt.addClassToStackGraphQL(RIDE_METAL_30);
      expect(result.success).toBe(true);
      expect(result.numClasses).toBe(1);
      expect(result.classIds).toContain(RIDE_METAL_30);
    });

    it("addMultipleToStack adds several rides sequentially", async () => {
      const result = await matt.addMultipleToStack([RIDE_POP_30, RIDE_EDM_30]);
      expect(result.success).toBe(true);
      expect(result.numClasses).toBe(3); // metal + pop + edm
    });

    it("viewUserStackGraphQL shows all added rides with details", async () => {
      const stack = await matt.viewUserStackGraphQL();
      expect(stack!.numClasses).toBe(3);
      expect(stack!.totalTime).toBe(1800 + 1800 + 1800); // 3 × 30 min

      const classes = stack!.userStack!.stackedClassList;
      expect(classes).toHaveLength(3);

      for (const cls of classes) {
        expect(cls.pelotonClass.title).toBeTruthy();
        expect(cls.pelotonClass.fitnessDiscipline).toBeDefined();
        expect(cls.pelotonClass.instructor).toBeDefined();
      }
    });

    it("modifyStack replaces the entire stack atomically", async () => {
      const result = await matt.modifyStack([RIDE_HIIT_RUN, RIDE_TABATA]);
      expect(result.success).toBe(true);
      expect(result.numClasses).toBe(2);
      expect(result.classIds).toEqual([RIDE_HIIT_RUN, RIDE_TABATA]);
    });

    it("clearStackGraphQL empties the stack", async () => {
      const cleared = await matt.clearStackGraphQL();
      expect(cleared).toBe(true);

      const stack = await matt.viewUserStackGraphQL();
      expect(stack!.numClasses).toBe(0);
    });
  });

  // =========================================================================
  // 5. Stack — REST operations (getStack, addToStack, removeFromStack)
  // =========================================================================
  describe("Stack — REST operations", () => {
    it("getStack returns empty stack", async () => {
      const stack = await matt.getStack();
      expect(stack).not.toBeNull();
      expect(stack!.total_classes).toBe(0);
    });

    it("addToStack adds a ride", async () => {
      const added = await matt.addToStack(RIDE_METAL_30);
      expect(added).toBe(true);

      const stack = await matt.getStack();
      expect(stack!.total_classes).toBe(1);
      expect(stack!.classes[0].id).toBe(RIDE_METAL_30);
    });

    it("removeFromStack removes a ride", async () => {
      const removed = await matt.removeFromStack(RIDE_METAL_30);
      expect(removed).toBe(true);

      const stack = await matt.getStack();
      expect(stack!.total_classes).toBe(0);
    });

    it("pushWorkoutsToStack adds multiple rides", async () => {
      const result = await matt.pushWorkoutsToStack([RIDE_POP_30, RIDE_EDM_30]);
      expect(result.success).toEqual([RIDE_POP_30, RIDE_EDM_30]);
      expect(result.failed).toEqual([]);

      // Clean up
      await matt.clearStackGraphQL();
    });
  });

  // =========================================================================
  // 6. getStackStatus — business logic layer
  // =========================================================================
  describe("getStackStatus — business logic", () => {
    it("returns empty stack status", async () => {
      const status = await getStackStatus(matt);
      expect(status.numClasses).toBe(0);
      expect(status.classes).toHaveLength(0);
      expect(status.fetchFailed).toBeUndefined();
    });

    it("returns populated stack with full details", async () => {
      await matt.addMultipleToStack([RIDE_METAL_30, RIDE_HIIT_RUN]);

      const status = await getStackStatus(matt);
      expect(status.numClasses).toBe(2);
      expect(status.classes).toHaveLength(2);

      for (const cls of status.classes) {
        expect(cls.classId).toBeTruthy();
        expect(cls.title).toBeTruthy();
        expect(cls.duration).toBeGreaterThan(0);
        expect(cls.discipline).toBeTruthy();
        expect(cls.instructor).toBeTruthy();
      }

      const metalRide = status.classes.find(c => c.classId === RIDE_METAL_30);
      expect(metalRide).toBeDefined();
      expect(metalRide!.title).toBe("30 min Metal Ride");
      expect(metalRide!.discipline).toBe("Cycling");
      expect(metalRide!.instructor).toBe("Bradley Rose");

      const hiitRun = status.classes.find(c => c.classId === RIDE_HIIT_RUN);
      expect(hiitRun).toBeDefined();
      expect(hiitRun!.title).toBe("20 min HIIT Run");
      expect(hiitRun!.discipline).toBe("Running");
      expect(hiitRun!.instructor).toBe("Marcel Dinkins");

      // Clean up
      await matt.clearStackGraphQL();
    });
  });

  // =========================================================================
  // 7. Cross-user isolation
  // =========================================================================
  describe("Cross-user isolation", () => {
    it("Matt and Jane have independent stacks", async () => {
      await matt.addClassToStackGraphQL(RIDE_METAL_30);

      const janeStack = await jane.viewUserStackGraphQL();
      expect(janeStack!.numClasses).toBe(0);

      await jane.addClassToStackGraphQL(RIDE_POP_30);

      const mattStack = await matt.viewUserStackGraphQL();
      expect(mattStack!.numClasses).toBe(1);
      expect(mattStack!.userStack!.stackedClassList[0].pelotonClass.classId).toBe(RIDE_METAL_30);

      const janeStack2 = await jane.viewUserStackGraphQL();
      expect(janeStack2!.numClasses).toBe(1);
      expect(janeStack2!.userStack!.stackedClassList[0].pelotonClass.classId).toBe(RIDE_POP_30);

      // Clean up
      await matt.clearStackGraphQL();
      await jane.clearStackGraphQL();
    });

    it("Matt and Jane have independent FTP histories", async () => {
      const mattUser = await matt.getMe();
      const janeUser = await jane.getMe();

      const mattHistory = await matt.getFtpHistory(mattUser.cycling_ftp_workout_id!);
      const janeHistory = await jane.getFtpHistory(janeUser.cycling_ftp_workout_id!);

      expect(mattHistory[0].workoutId).not.toBe(janeHistory[0].workoutId);
      expect(mattHistory[0].calculatedFtp).toBe(267);
      expect(janeHistory[0].calculatedFtp).toBe(195);
    });
  });

  // =========================================================================
  // 8. Error handling
  // =========================================================================
  describe("Error handling", () => {
    it("invalid token returns auth error", async () => {
      const badClient = new PelotonClient("bad-token-12345");
      await expect(badClient.getMe()).rejects.toThrow();
    });

    it("non-existent workout returns empty FTP chain", async () => {
      const history = await matt.getFtpHistory("nonexistent_workout_id_000");
      expect(history).toHaveLength(0);
    });

    it("adding non-existent ride to stack fails gracefully", async () => {
      const result = await matt.addClassToStackGraphQL("00000000000000000000000000000000");
      expect(result.success).toBe(false);
    });
  });
});

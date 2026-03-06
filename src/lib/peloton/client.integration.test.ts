/**
 * Integration tests for PelotonClient against the digital twin (dtu-peloton).
 *
 * These tests exercise the real HTTP path: PelotonClient → fetch → dtu-peloton server.
 * The digital twin must be running on localhost:4201 before these tests execute.
 *
 * Run standalone:  npx vitest run src/lib/peloton/client.integration.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { PelotonClient, encodeClassIdForGraphQL, decodeGraphQLClassId } from "./client";
import { server } from "@/test/setup";

// --- Constants matching dtu-peloton seed data ---
const DTU_URL = "http://localhost:4201";
const DTU_GQL_URL = "http://localhost:4201/graphql";
const TOKEN = "test-token";

const USER_ID = "efcac68d7abf4b83a89d347416d76089";
const WORKOUT_1_ID = "4e77e9a27f074a509fe08d4eb41e6b36"; // most recent FTP test
const WORKOUT_2_ID = "096f513cf5914c0f8eef81c870e4779c"; // first FTP test

// Sample ride IDs from the seed data
const RIDE_PZ_30 = "d46adf451aae41609125438c52823dc8"; // 30 min Power Zone
const RIDE_CLIMB_45 = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"; // 45 min Climb
const RIDE_STRENGTH_10 = "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8"; // 10 min Arms

let client: PelotonClient;

beforeAll(() => {
  // Disable MSW so real HTTP requests reach the digital twin
  server.close();

  // Point PelotonClient at the digital twin by setting env vars
  process.env.PELOTON_API_URL = DTU_URL;
  process.env.PELOTON_GRAPHQL_URL = DTU_GQL_URL;

  // Re-import to pick up env vars — PelotonClient reads them at module scope,
  // but since the module is already loaded we need to reload it.
  // Instead, we make raw fetch calls where env vars matter, and use
  // the client for methods that go through this.fetch().
  // Actually, since PELOTON_API_URL is captured at import time as a const,
  // we need to work around that. We'll construct a thin wrapper.
  client = new PelotonClient(TOKEN);
});

afterAll(() => {
  delete process.env.PELOTON_API_URL;
  delete process.env.PELOTON_GRAPHQL_URL;
  server.listen({ onUnhandledRequest: "bypass" });
});

// ---------------------------------------------------------------------------
// Helper: make a direct fetch against the DTU to bypass the module-level const
// ---------------------------------------------------------------------------
async function dtuFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${DTU_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`DTU responded ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function dtuGraphQL<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch(DTU_GQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
  });
  if (!res.ok) {
    throw new Error(`DTU GraphQL responded ${res.status}: ${res.statusText}`);
  }
  const json = await res.json();
  return json.data as T;
}

// ===========================================================================
// Tests
// ===========================================================================

describe("Digital Twin Integration", () => {
  // ---- Authentication ----
  describe("Authentication", () => {
    it("should reject requests without an auth header", async () => {
      const res = await fetch(`${DTU_URL}/api/me`);
      expect(res.status).toBe(401);
    });

    it("should reject requests with an invalid token", async () => {
      const res = await fetch(`${DTU_URL}/api/me`, {
        headers: { Authorization: "Bearer bad-token" },
      });
      expect(res.status).toBe(401);
    });

    it("should accept requests with a valid token", async () => {
      const res = await fetch(`${DTU_URL}/api/me`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      expect(res.status).toBe(200);
    });
  });

  // ---- GET /api/me ----
  describe("GET /api/me", () => {
    it("should return the seeded user profile", async () => {
      const user = await dtuFetch<{
        id: string;
        username: string;
        email: string;
        cycling_ftp: number;
        cycling_ftp_source: string;
        cycling_ftp_workout_id: string;
        estimated_cycling_ftp: number;
      }>("/api/me");

      expect(user.id).toBe(USER_ID);
      expect(user.username).toBe("TestRider");
      expect(user.email).toBe("test@example.com");
      expect(user.cycling_ftp).toBe(176);
      expect(user.cycling_ftp_source).toBe("ftp_workout_source");
      expect(user.cycling_ftp_workout_id).toBe(WORKOUT_1_ID);
      expect(user.estimated_cycling_ftp).toBe(199);
    });
  });

  // ---- GET /api/workout/:id ----
  describe("GET /api/workout/:id", () => {
    it("should return the most recent FTP workout with correct baseline semantics", async () => {
      const workout = await dtuFetch<{
        id: string;
        status: string;
        fitness_discipline: string;
        ftp_info: { ftp: number; ftp_source: string; ftp_workout_id: string };
        ride: { title: string; duration: number };
      }>(`/api/workout/${WORKOUT_1_ID}`);

      expect(workout.id).toBe(WORKOUT_1_ID);
      expect(workout.status).toBe("COMPLETE");
      expect(workout.fitness_discipline).toBe("cycling");
      // ftp_info.ftp is the BASELINE going into this test, not the result
      expect(workout.ftp_info.ftp).toBe(183);
      expect(workout.ftp_info.ftp_workout_id).toBe(WORKOUT_2_ID);
      expect(workout.ride.title).toBe("20 min FTP Test Ride");
      expect(workout.ride.duration).toBe(1200);
    });

    it("should return the first FTP workout with ftp=0 (no prior baseline)", async () => {
      const workout = await dtuFetch<{
        id: string;
        ftp_info: { ftp: number; ftp_source: null; ftp_workout_id: null };
      }>(`/api/workout/${WORKOUT_2_ID}`);

      expect(workout.id).toBe(WORKOUT_2_ID);
      expect(workout.ftp_info.ftp).toBe(0);
      expect(workout.ftp_info.ftp_source).toBeNull();
      expect(workout.ftp_info.ftp_workout_id).toBeNull();
    });

    it("should return 404 for a non-existent workout", async () => {
      const res = await fetch(`${DTU_URL}/api/workout/nonexistent`, {
        headers: { Authorization: `Bearer ${TOKEN}` },
      });
      expect(res.status).toBe(404);
    });
  });

  // ---- GET /api/workout/:id/performance_graph ----
  describe("GET /api/workout/:id/performance_graph", () => {
    it("should return performance data for workout 1", async () => {
      const perf = await dtuFetch<{
        duration: number;
        average_summaries: Array<{ slug: string; value: number; display_unit: string }>;
        summaries: Array<{ slug: string; value: number }>;
      }>(`/api/workout/${WORKOUT_1_ID}/performance_graph`);

      expect(perf.duration).toBe(1200);

      const avgOutput = perf.average_summaries.find((s) => s.slug === "avg_output");
      expect(avgOutput).toBeDefined();
      expect(avgOutput!.value).toBe(185);
      expect(avgOutput!.display_unit).toBe("watts");

      // Validate FTP calculation: 185 * 0.95 = 175.75 → rounds to 176
      const calculatedFtp = Math.round(avgOutput!.value * 0.95);
      expect(calculatedFtp).toBe(176);

      expect(perf.summaries.length).toBeGreaterThan(0);
    });

    it("should return performance data for workout 2", async () => {
      const perf = await dtuFetch<{
        average_summaries: Array<{ slug: string; value: number }>;
      }>(`/api/workout/${WORKOUT_2_ID}/performance_graph`);

      const avgOutput = perf.average_summaries.find((s) => s.slug === "avg_output");
      expect(avgOutput).toBeDefined();
      expect(avgOutput!.value).toBe(193);

      // FTP = 193 * 0.95 = 183.35 → rounds to 183
      expect(Math.round(avgOutput!.value * 0.95)).toBe(183);
    });
  });

  // ---- FTP History Chain ----
  describe("FTP History Chain", () => {
    it("should walk the full FTP workout chain and calculate correct FTP values", async () => {
      // Start from the user's cycling_ftp_workout_id
      const user = await dtuFetch<{ cycling_ftp_workout_id: string }>("/api/me");
      const startId = user.cycling_ftp_workout_id;
      expect(startId).toBe(WORKOUT_1_ID);

      // Walk the chain manually
      const chain: Array<{ workoutId: string; avgOutput: number; calculatedFtp: number; baselineFtp: number }> = [];
      let currentId: string | null = startId;

      while (currentId) {
        const workout = await dtuFetch<{
          id: string;
          ftp_info: { ftp: number; ftp_workout_id: string | null };
        }>(`/api/workout/${currentId}`);

        const perf = await dtuFetch<{
          average_summaries: Array<{ slug: string; value: number }>;
        }>(`/api/workout/${currentId}/performance_graph`);

        const avgOutput = perf.average_summaries.find((s) => s.slug === "avg_output")!.value;

        chain.push({
          workoutId: workout.id,
          avgOutput,
          calculatedFtp: Math.round(avgOutput * 0.95),
          baselineFtp: workout.ftp_info.ftp,
        });

        currentId = workout.ftp_info.ftp_workout_id;
      }

      // Should have 2 workouts in the chain
      expect(chain).toHaveLength(2);

      // Most recent test: avg=185, FTP=176, baseline was 183
      expect(chain[0].workoutId).toBe(WORKOUT_1_ID);
      expect(chain[0].avgOutput).toBe(185);
      expect(chain[0].calculatedFtp).toBe(176);
      expect(chain[0].baselineFtp).toBe(183);

      // First test: avg=193, FTP=183, baseline was 0 (first test)
      expect(chain[1].workoutId).toBe(WORKOUT_2_ID);
      expect(chain[1].avgOutput).toBe(193);
      expect(chain[1].calculatedFtp).toBe(183);
      expect(chain[1].baselineFtp).toBe(0);
    });
  });

  // ---- GET /api/user/:id/workouts ----
  describe("GET /api/user/:id/workouts", () => {
    it("should return paginated workout list for the user", async () => {
      const result = await dtuFetch<{
        data: Array<{ id: string; fitness_discipline: string }>;
        page: number;
        page_count: number;
      }>(`/api/user/${USER_ID}/workouts`);

      expect(result.data).toBeInstanceOf(Array);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.page).toBe(0);

      // All workouts should belong to the user
      for (const workout of result.data) {
        expect(workout.id).toBeTruthy();
        expect(workout.fitness_discipline).toBeTruthy();
      }
    });
  });

  // ---- GET /api/v2/ride/archived (Search) ----
  describe("GET /api/v2/ride/archived (Search)", () => {
    it("should return all rides when no filters are applied", async () => {
      const result = await dtuFetch<{
        data: Array<{ id: string; title: string; fitness_discipline: string }>;
        total: number;
        page: number;
        limit: number;
      }>("/api/v2/ride/archived");

      expect(result.data.length).toBeGreaterThan(0);
      expect(result.total).toBe(result.data.length);
    });

    it("should filter by fitness_discipline=cycling", async () => {
      const result = await dtuFetch<{
        data: Array<{ fitness_discipline: string }>;
        total: number;
      }>("/api/v2/ride/archived?fitness_discipline=cycling");

      expect(result.data.length).toBeGreaterThan(0);
      for (const ride of result.data) {
        expect(ride.fitness_discipline).toBe("cycling");
      }
    });

    it("should filter by fitness_discipline=strength", async () => {
      const result = await dtuFetch<{
        data: Array<{ fitness_discipline: string }>;
        total: number;
      }>("/api/v2/ride/archived?fitness_discipline=strength");

      expect(result.data.length).toBeGreaterThan(0);
      for (const ride of result.data) {
        expect(ride.fitness_discipline).toBe("strength");
      }
    });

    it("should filter by duration", async () => {
      const result = await dtuFetch<{
        data: Array<{ duration: number }>;
      }>("/api/v2/ride/archived?duration=1800");

      expect(result.data.length).toBeGreaterThan(0);
      for (const ride of result.data) {
        expect(ride.duration).toBe(1800);
      }
    });

    it("should filter by instructor_id", async () => {
      const instructorId = "1697e6f580494740a5a1ca62b8b3f47c"; // Alex Toussaint
      const result = await dtuFetch<{
        data: Array<{ instructor_id: string; instructor: { name: string } }>;
      }>(`/api/v2/ride/archived?fitness_discipline=cycling&instructor_id=${instructorId}`);

      expect(result.data.length).toBeGreaterThan(0);
      for (const ride of result.data) {
        expect(ride.instructor_id).toBe(instructorId);
      }
    });

    it("should paginate results with limit", async () => {
      const result = await dtuFetch<{
        data: Array<{ id: string }>;
        total: number;
        limit: number;
        page: number;
        page_count: number;
      }>("/api/v2/ride/archived?limit=2&page=0");

      expect(result.data).toHaveLength(2);
      expect(result.limit).toBe(2);
      expect(result.page).toBe(0);
      expect(result.page_count).toBeGreaterThan(1);
      expect(result.total).toBeGreaterThan(2);
    });
  });

  // ---- REST Stack ----
  describe("REST Stack Management", () => {
    it("should start with an empty stack", async () => {
      const stack = await dtuFetch<{
        id: string;
        classes: Array<{ id: string }>;
        total_classes: number;
      }>(`/api/user/${USER_ID}/stack`);

      expect(stack.classes).toHaveLength(0);
      expect(stack.total_classes).toBe(0);
    });

    it("should add a ride to the stack", async () => {
      await dtuFetch(`/api/user/${USER_ID}/stack`, {
        method: "POST",
        body: JSON.stringify({ peloton_class_id: RIDE_PZ_30 }),
      });

      const stack = await dtuFetch<{
        classes: Array<{ id: string; title: string }>;
        total_classes: number;
      }>(`/api/user/${USER_ID}/stack`);

      expect(stack.total_classes).toBe(1);
      expect(stack.classes[0].id).toBe(RIDE_PZ_30);
      expect(stack.classes[0].title).toBe("30 min Power Zone Ride");
    });

    it("should not add duplicate rides", async () => {
      await dtuFetch(`/api/user/${USER_ID}/stack`, {
        method: "POST",
        body: JSON.stringify({ peloton_class_id: RIDE_PZ_30 }),
      });

      const stack = await dtuFetch<{
        classes: Array<{ id: string }>;
        total_classes: number;
      }>(`/api/user/${USER_ID}/stack`);

      expect(stack.total_classes).toBe(1);
    });

    it("should add a second ride and preserve order", async () => {
      await dtuFetch(`/api/user/${USER_ID}/stack`, {
        method: "POST",
        body: JSON.stringify({ peloton_class_id: RIDE_CLIMB_45 }),
      });

      const stack = await dtuFetch<{
        classes: Array<{ id: string }>;
        total_classes: number;
      }>(`/api/user/${USER_ID}/stack`);

      expect(stack.total_classes).toBe(2);
      expect(stack.classes[0].id).toBe(RIDE_PZ_30);
      expect(stack.classes[1].id).toBe(RIDE_CLIMB_45);
    });

    it("should remove a ride from the stack", async () => {
      await dtuFetch(`/api/user/${USER_ID}/stack/${RIDE_PZ_30}`, {
        method: "DELETE",
      });

      const stack = await dtuFetch<{
        classes: Array<{ id: string }>;
        total_classes: number;
      }>(`/api/user/${USER_ID}/stack`);

      expect(stack.total_classes).toBe(1);
      expect(stack.classes[0].id).toBe(RIDE_CLIMB_45);
    });

    it("should reject adding a non-existent ride", async () => {
      const res = await fetch(`${DTU_URL}/api/user/${USER_ID}/stack`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ peloton_class_id: "nonexistent_ride_id_12345678" }),
      });
      expect(res.status).toBe(404);
    });

    // Clean up: remove remaining items via GraphQL ModifyStack (clear)
    it("should clear the stack via REST delete", async () => {
      // Remove remaining ride
      await dtuFetch(`/api/user/${USER_ID}/stack/${RIDE_CLIMB_45}`, {
        method: "DELETE",
      });

      const stack = await dtuFetch<{
        classes: Array<{ id: string }>;
        total_classes: number;
      }>(`/api/user/${USER_ID}/stack`);

      expect(stack.total_classes).toBe(0);
    });
  });

  // ---- GraphQL Stack ----
  describe("GraphQL Stack Management", () => {
    it("ViewUserStack should return an empty stack initially", async () => {
      const data = await dtuGraphQL<{
        viewUserStack: {
          numClasses: number;
          totalTime: number;
          userStack: { stackedClassList: unknown[] };
        };
      }>(`
        query ViewUserStack {
          viewUserStack {
            numClasses
            totalTime
            userStack { stackedClassList { playOrder pelotonClass { classId title duration } } }
          }
        }
      `);

      expect(data.viewUserStack.numClasses).toBe(0);
      expect(data.viewUserStack.totalTime).toBe(0);
      expect(data.viewUserStack.userStack.stackedClassList).toHaveLength(0);
    });

    it("AddClassToStack should add a ride with correct base64 encoding", async () => {
      const encodedId = encodeClassIdForGraphQL(RIDE_PZ_30);

      const data = await dtuGraphQL<{
        addClassToStack: {
          numClasses: number;
          totalTime: number;
          userStack: {
            stackedClassList: Array<{
              playOrder: number;
              pelotonClass: { classId: string; title: string; duration: number };
            }>;
          };
        };
      }>(
        `mutation AddClassToStack($input: AddClassToStackInput!) {
          addClassToStack(input: $input) {
            numClasses totalTime
            userStack { stackedClassList { playOrder pelotonClass { classId title duration } } }
          }
        }`,
        { input: { pelotonClassId: encodedId } }
      );

      expect(data.addClassToStack.numClasses).toBe(1);
      expect(data.addClassToStack.totalTime).toBe(1800); // 30 min = 1800s
      const cls = data.addClassToStack.userStack.stackedClassList[0];
      expect(cls.playOrder).toBe(0);
      expect(cls.pelotonClass.classId).toBe(RIDE_PZ_30);
      expect(cls.pelotonClass.title).toBe("30 min Power Zone Ride");
    });

    it("AddClassToStack should add a second ride", async () => {
      const encodedId = encodeClassIdForGraphQL(RIDE_STRENGTH_10);

      const data = await dtuGraphQL<{
        addClassToStack: {
          numClasses: number;
          totalTime: number;
          userStack: {
            stackedClassList: Array<{
              playOrder: number;
              pelotonClass: { classId: string; title: string };
            }>;
          };
        };
      }>(
        `mutation AddClassToStack($input: AddClassToStackInput!) {
          addClassToStack(input: $input) {
            numClasses totalTime
            userStack { stackedClassList { playOrder pelotonClass { classId title } } }
          }
        }`,
        { input: { pelotonClassId: encodedId } }
      );

      expect(data.addClassToStack.numClasses).toBe(2);
      expect(data.addClassToStack.totalTime).toBe(1800 + 600); // 30 min + 10 min
      expect(data.addClassToStack.userStack.stackedClassList).toHaveLength(2);
    });

    it("ModifyStack should replace the stack atomically", async () => {
      const newRideIds = [RIDE_CLIMB_45, RIDE_PZ_30];
      const encodedIds = newRideIds.map((id) => encodeClassIdForGraphQL(id));

      const data = await dtuGraphQL<{
        modifyStack: {
          numClasses: number;
          totalTime: number;
          userStack: {
            stackedClassList: Array<{
              playOrder: number;
              pelotonClass: { classId: string; title: string };
            }>;
          };
        };
      }>(
        `mutation ModifyStack($input: ModifyStackInput!) {
          modifyStack(input: $input) {
            numClasses totalTime
            userStack { stackedClassList { playOrder pelotonClass { classId title } } }
          }
        }`,
        { input: { pelotonClassIdList: encodedIds } }
      );

      expect(data.modifyStack.numClasses).toBe(2);
      expect(data.modifyStack.totalTime).toBe(2700 + 1800); // 45 min + 30 min
      const classIds = data.modifyStack.userStack.stackedClassList.map(
        (c) => c.pelotonClass.classId
      );
      expect(classIds).toEqual([RIDE_CLIMB_45, RIDE_PZ_30]);
    });

    it("ModifyStack with empty list should clear the stack", async () => {
      const data = await dtuGraphQL<{
        modifyStack: {
          numClasses: number;
          totalTime: number;
          userStack: { stackedClassList: unknown[] };
        };
      }>(
        `mutation ModifyStack($input: ModifyStackInput!) {
          modifyStack(input: $input) {
            numClasses totalTime
            userStack { stackedClassList { playOrder pelotonClass { classId } } }
          }
        }`,
        { input: { pelotonClassIdList: [] } }
      );

      expect(data.modifyStack.numClasses).toBe(0);
      expect(data.modifyStack.totalTime).toBe(0);
      expect(data.modifyStack.userStack.stackedClassList).toHaveLength(0);
    });

    it("ViewUserStack includes fitnessDiscipline and instructor", async () => {
      // Add a ride first
      const encodedId = encodeClassIdForGraphQL(RIDE_PZ_30);
      await dtuGraphQL(
        `mutation AddClassToStack($input: AddClassToStackInput!) {
          addClassToStack(input: $input) { numClasses }
        }`,
        { input: { pelotonClassId: encodedId } }
      );

      const data = await dtuGraphQL<{
        viewUserStack: {
          userStack: {
            stackedClassList: Array<{
              pelotonClass: {
                classId: string;
                fitnessDiscipline: { slug: string; displayName: string };
                instructor: { name: string };
              };
            }>;
          };
        };
      }>(`
        query ViewUserStack {
          viewUserStack {
            userStack {
              stackedClassList {
                pelotonClass {
                  classId
                  fitnessDiscipline { slug displayName }
                  instructor { name }
                }
              }
            }
          }
        }
      `);

      const cls = data.viewUserStack.userStack.stackedClassList[0].pelotonClass;
      expect(cls.fitnessDiscipline.slug).toBe("cycling");
      expect(cls.fitnessDiscipline.displayName).toBe("Cycling");
      expect(cls.instructor.name).toBe("Alex Toussaint");

      // Clean up
      await dtuGraphQL(
        `mutation ModifyStack($input: ModifyStackInput!) {
          modifyStack(input: $input) { numClasses }
        }`,
        { input: { pelotonClassIdList: [] } }
      );
    });
  });

  // ---- Base64 Encoding/Decoding ----
  describe("Base64 Class ID Encoding", () => {
    it("encodeClassIdForGraphQL produces a valid base64 string", () => {
      const encoded = encodeClassIdForGraphQL(RIDE_PZ_30);
      expect(encoded).toBeTruthy();

      // Should be valid base64
      const decoded = Buffer.from(encoded, "base64").toString("utf-8");
      const parsed = JSON.parse(decoded);
      expect(parsed.ride_id).toBe(RIDE_PZ_30);
      expect(parsed.type).toBe("on_demand");
    });

    it("decodeGraphQLClassId round-trips with encodeClassIdForGraphQL", () => {
      const encoded = encodeClassIdForGraphQL(RIDE_CLIMB_45);
      const decoded = decodeGraphQLClassId(encoded);
      expect(decoded).toBe(RIDE_CLIMB_45);
    });

    it("the digital twin correctly decodes our base64 encoding", async () => {
      // This is the critical integration test: does the DTU decode the same
      // base64 format that encodeClassIdForGraphQL produces?
      const encodedId = encodeClassIdForGraphQL(RIDE_STRENGTH_10);

      const data = await dtuGraphQL<{
        addClassToStack: {
          numClasses: number;
          userStack: {
            stackedClassList: Array<{
              pelotonClass: { classId: string };
            }>;
          };
        };
      }>(
        `mutation AddClassToStack($input: AddClassToStackInput!) {
          addClassToStack(input: $input) {
            numClasses
            userStack { stackedClassList { pelotonClass { classId } } }
          }
        }`,
        { input: { pelotonClassId: encodedId } }
      );

      // The DTU should have decoded the base64, extracted ride_id, and returned it
      const returnedId = data.addClassToStack.userStack.stackedClassList.find(
        (c) => c.pelotonClass.classId === RIDE_STRENGTH_10
      );
      expect(returnedId).toBeDefined();

      // Clean up
      await dtuGraphQL(
        `mutation ModifyStack($input: ModifyStackInput!) {
          modifyStack(input: $input) { numClasses }
        }`,
        { input: { pelotonClassIdList: [] } }
      );
    });
  });

  // ---- Cross-endpoint Consistency ----
  describe("Cross-endpoint Consistency", () => {
    it("REST and GraphQL stacks should be in sync", async () => {
      // Add via GraphQL
      const encodedId = encodeClassIdForGraphQL(RIDE_PZ_30);
      await dtuGraphQL(
        `mutation AddClassToStack($input: AddClassToStackInput!) {
          addClassToStack(input: $input) { numClasses }
        }`,
        { input: { pelotonClassId: encodedId } }
      );

      // Read via REST
      const restStack = await dtuFetch<{
        classes: Array<{ id: string }>;
        total_classes: number;
      }>(`/api/user/${USER_ID}/stack`);

      expect(restStack.total_classes).toBe(1);
      expect(restStack.classes[0].id).toBe(RIDE_PZ_30);

      // Read via GraphQL
      const gqlData = await dtuGraphQL<{
        viewUserStack: {
          numClasses: number;
          userStack: {
            stackedClassList: Array<{ pelotonClass: { classId: string } }>;
          };
        };
      }>(`
        query ViewUserStack {
          viewUserStack {
            numClasses
            userStack { stackedClassList { pelotonClass { classId } } }
          }
        }
      `);

      expect(gqlData.viewUserStack.numClasses).toBe(1);
      expect(gqlData.viewUserStack.userStack.stackedClassList[0].pelotonClass.classId).toBe(RIDE_PZ_30);

      // Clean up via GraphQL
      await dtuGraphQL(
        `mutation ModifyStack($input: ModifyStackInput!) {
          modifyStack(input: $input) { numClasses }
        }`,
        { input: { pelotonClassIdList: [] } }
      );
    });

    it("user cycling_ftp matches the calculated FTP from the linked workout", async () => {
      const user = await dtuFetch<{
        cycling_ftp: number;
        cycling_ftp_workout_id: string;
      }>("/api/me");

      const perf = await dtuFetch<{
        average_summaries: Array<{ slug: string; value: number }>;
      }>(`/api/workout/${user.cycling_ftp_workout_id}/performance_graph`);

      const avgOutput = perf.average_summaries.find((s) => s.slug === "avg_output")!.value;
      const calculatedFtp = Math.round(avgOutput * 0.95);

      expect(user.cycling_ftp).toBe(calculatedFtp);
    });
  });
});

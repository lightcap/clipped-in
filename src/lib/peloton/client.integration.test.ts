/**
 * Integration tests for PelotonClient against the digital twin (dtu-peloton).
 *
 * These tests exercise the real HTTP path: PelotonClient → fetch → dtu-peloton server.
 * The digital twin must be running on localhost:4201 before these tests execute.
 *
 * Run standalone:  npx vitest run src/lib/peloton/client.integration.test.ts
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { encodeClassIdForGraphQL, decodeGraphQLClassId } from "./client";
import { server } from "@/test/setup";

// --- Constants matching dtu-peloton seed.json (shared with supabase/seed.sql) ---
const DTU_URL = "http://localhost:4201";
const DTU_GQL_URL = "http://localhost:4201/graphql";
const TOKEN_MATT = "test-token-matt";
const TOKEN_JANE = "test-token-jane";

const MATT_USER_ID = "48bcbd2444f744138043812a9420bbe0";
const JANE_USER_ID = "fake_peloton_user_002";
const WORKOUT_1_ID = "4e77e9a27f074a509fe08d4eb41e6b36"; // Matt's most recent FTP test
const WORKOUT_2_ID = "096f513cf5914c0f8eef81c870e4779c"; // Matt's first FTP test

// Sample ride IDs from the seed data
const RIDE_PZ_30 = "d46adf451aae41609125438c52823dc8"; // 30 min Power Zone
const RIDE_CLIMB_45 = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6"; // 45 min Climb
const RIDE_STRENGTH_10 = "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8"; // 10 min Arms

beforeAll(() => {
  // Disable MSW so real HTTP requests reach the digital twin
  server.close();
});

afterAll(() => {
  server.listen({ onUnhandledRequest: "bypass" });
});

// ---------------------------------------------------------------------------
// Helper: make a direct fetch against the DTU
// ---------------------------------------------------------------------------
async function dtuFetch<T>(path: string, options?: RequestInit & { token?: string }): Promise<T> {
  const token = options?.token ?? TOKEN_MATT;
  const { token: _t, ...fetchOptions } = options ?? {};
  const res = await fetch(`${DTU_URL}${path}`, {
    ...fetchOptions,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...fetchOptions?.headers,
    },
  });
  if (!res.ok) {
    throw new Error(`DTU responded ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

async function dtuGraphQL<T>(
  query: string,
  variables?: Record<string, unknown>,
  token: string = TOKEN_MATT
): Promise<T> {
  const res = await fetch(DTU_GQL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
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

    it("should accept requests with Matt's token", async () => {
      const res = await fetch(`${DTU_URL}/api/me`, {
        headers: { Authorization: `Bearer ${TOKEN_MATT}` },
      });
      expect(res.status).toBe(200);
    });

    it("should accept requests with Jane's token", async () => {
      const res = await fetch(`${DTU_URL}/api/me`, {
        headers: { Authorization: `Bearer ${TOKEN_JANE}` },
      });
      expect(res.status).toBe(200);
    });
  });

  // ---- GET /api/me ----
  describe("GET /api/me", () => {
    it("should return Matt's profile (matching seed.sql)", async () => {
      const user = await dtuFetch<{
        id: string;
        username: string;
        email: string;
        name: string;
        cycling_ftp: number;
        cycling_ftp_source: string;
        cycling_ftp_workout_id: string;
        estimated_cycling_ftp: number;
      }>("/api/me");

      expect(user.id).toBe(MATT_USER_ID);
      expect(user.username).toBe("lightcap");
      expect(user.email).toBe("matthew@thekerns.net");
      expect(user.name).toBe("Matt Kern");
      expect(user.cycling_ftp).toBe(267);
      expect(user.cycling_ftp_source).toBe("ftp_workout_source");
      expect(user.cycling_ftp_workout_id).toBe(WORKOUT_1_ID);
      expect(user.estimated_cycling_ftp).toBe(270);
    });

    it("should return Jane's profile (matching seed.sql)", async () => {
      const user = await dtuFetch<{
        id: string;
        username: string;
        email: string;
        cycling_ftp: number;
        estimated_cycling_ftp: number;
      }>("/api/me", { token: TOKEN_JANE });

      expect(user.id).toBe(JANE_USER_ID);
      expect(user.username).toBe("jane_rides");
      expect(user.email).toBe("jane@test.dev");
      expect(user.cycling_ftp).toBe(195);
      expect(user.estimated_cycling_ftp).toBe(200);
    });
  });

  // ---- GET /api/workout/:id ----
  describe("GET /api/workout/:id", () => {
    it("should return Matt's most recent FTP workout with correct baseline semantics", async () => {
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
      // ftp_info.ftp is the BASELINE going into this test (matching seed.sql baseline_ftp=219)
      expect(workout.ftp_info.ftp).toBe(219);
      expect(workout.ftp_info.ftp_workout_id).toBe(WORKOUT_2_ID);
      expect(workout.ride.title).toBe("20 min FTP Test Ride");
      expect(workout.ride.duration).toBe(1200);
    });

    it("should return Matt's first FTP workout with baseline=208 (from seed.sql)", async () => {
      const workout = await dtuFetch<{
        id: string;
        ftp_info: { ftp: number; ftp_source: string; ftp_workout_id: string | null };
      }>(`/api/workout/${WORKOUT_2_ID}`);

      expect(workout.id).toBe(WORKOUT_2_ID);
      // Baseline going into this test was 208 (from seed.sql)
      expect(workout.ftp_info.ftp).toBe(208);
      // This is the end of the chain — no prior workout
      expect(workout.ftp_info.ftp_workout_id).toBeNull();
    });

    it("should return 404 for a non-existent workout", async () => {
      const res = await fetch(`${DTU_URL}/api/workout/nonexistent`, {
        headers: { Authorization: `Bearer ${TOKEN_MATT}` },
      });
      expect(res.status).toBe(404);
    });
  });

  // ---- GET /api/workout/:id/performance_graph ----
  describe("GET /api/workout/:id/performance_graph", () => {
    it("should return performance data for workout 1 (avg_output=281)", async () => {
      const perf = await dtuFetch<{
        duration: number;
        average_summaries: Array<{ slug: string; value: number; display_unit: string }>;
        summaries: Array<{ slug: string; value: number }>;
      }>(`/api/workout/${WORKOUT_1_ID}/performance_graph`);

      expect(perf.duration).toBe(1200);

      const avgOutput = perf.average_summaries.find((s) => s.slug === "avg_output");
      expect(avgOutput).toBeDefined();
      expect(avgOutput!.value).toBe(281); // matching seed.sql avg_output=281
      expect(avgOutput!.display_unit).toBe("watts");

      // Validate FTP calculation: 281 * 0.95 = 266.95 → rounds to 267 (matching seed.sql)
      const calculatedFtp = Math.round(avgOutput!.value * 0.95);
      expect(calculatedFtp).toBe(267);

      expect(perf.summaries.length).toBeGreaterThan(0);
    });

    it("should return performance data for workout 2 (avg_output=231)", async () => {
      const perf = await dtuFetch<{
        average_summaries: Array<{ slug: string; value: number }>;
      }>(`/api/workout/${WORKOUT_2_ID}/performance_graph`);

      const avgOutput = perf.average_summaries.find((s) => s.slug === "avg_output");
      expect(avgOutput).toBeDefined();
      expect(avgOutput!.value).toBe(231); // matching seed.sql avg_output=231

      // FTP = 231 * 0.95 = 219.45 → rounds to 219 (matching seed.sql calculated_ftp=219)
      expect(Math.round(avgOutput!.value * 0.95)).toBe(219);
    });
  });

  // ---- FTP History Chain ----
  describe("FTP History Chain", () => {
    it("should walk Matt's full FTP workout chain (matching seed.sql)", async () => {
      const user = await dtuFetch<{ cycling_ftp_workout_id: string }>("/api/me");
      const startId = user.cycling_ftp_workout_id;
      expect(startId).toBe(WORKOUT_1_ID);

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

      // Most recent test: avg=281, FTP=267, baseline was 219
      expect(chain[0].workoutId).toBe(WORKOUT_1_ID);
      expect(chain[0].avgOutput).toBe(281);
      expect(chain[0].calculatedFtp).toBe(267);
      expect(chain[0].baselineFtp).toBe(219);

      // First test: avg=231, FTP=219, baseline was 208
      expect(chain[1].workoutId).toBe(WORKOUT_2_ID);
      expect(chain[1].avgOutput).toBe(231);
      expect(chain[1].calculatedFtp).toBe(219);
      expect(chain[1].baselineFtp).toBe(208);
    });
  });

  // ---- GET /api/user/:id/workouts ----
  describe("GET /api/user/:id/workouts", () => {
    it("should return paginated workout list for Matt", async () => {
      const result = await dtuFetch<{
        data: Array<{ id: string; fitness_discipline: string }>;
        page: number;
        page_count: number;
      }>(`/api/user/${MATT_USER_ID}/workouts`);

      expect(result.data).toBeInstanceOf(Array);
      expect(result.data.length).toBeGreaterThan(0);
      expect(result.page).toBe(0);

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

      // seed.json has 26 rides total, default page limit is 20
      expect(result.total).toBe(26);
      expect(result.data.length).toBe(20); // capped by default limit
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

    it("should filter by fitness_discipline=running", async () => {
      const result = await dtuFetch<{
        data: Array<{ fitness_discipline: string }>;
        total: number;
      }>("/api/v2/ride/archived?fitness_discipline=running");

      expect(result.data.length).toBeGreaterThan(0);
      for (const ride of result.data) {
        expect(ride.fitness_discipline).toBe("running");
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
        data: Array<{ instructor_id: string }>;
      }>(`/api/v2/ride/archived?instructor_id=${instructorId}`);

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
      }>("/api/v2/ride/archived?limit=5&page=0");

      expect(result.data).toHaveLength(5);
      expect(result.limit).toBe(5);
      expect(result.page).toBe(0);
      expect(result.page_count).toBeGreaterThan(1);
      expect(result.total).toBeGreaterThan(5);
    });
  });

  // ---- REST Stack ----
  describe("REST Stack Management", () => {
    it("should start with an empty stack", async () => {
      const stack = await dtuFetch<{
        id: string;
        classes: Array<{ id: string }>;
        total_classes: number;
      }>(`/api/user/${MATT_USER_ID}/stack`);

      expect(stack.classes).toHaveLength(0);
      expect(stack.total_classes).toBe(0);
    });

    it("should add a ride to the stack", async () => {
      await dtuFetch(`/api/user/${MATT_USER_ID}/stack`, {
        method: "POST",
        body: JSON.stringify({ peloton_class_id: RIDE_PZ_30 }),
      });

      const stack = await dtuFetch<{
        classes: Array<{ id: string; title: string }>;
        total_classes: number;
      }>(`/api/user/${MATT_USER_ID}/stack`);

      expect(stack.total_classes).toBe(1);
      expect(stack.classes[0].id).toBe(RIDE_PZ_30);
      expect(stack.classes[0].title).toBe("30 min Power Zone Ride");
    });

    it("should not add duplicate rides", async () => {
      await dtuFetch(`/api/user/${MATT_USER_ID}/stack`, {
        method: "POST",
        body: JSON.stringify({ peloton_class_id: RIDE_PZ_30 }),
      });

      const stack = await dtuFetch<{
        classes: Array<{ id: string }>;
        total_classes: number;
      }>(`/api/user/${MATT_USER_ID}/stack`);

      expect(stack.total_classes).toBe(1);
    });

    it("should add a second ride and preserve order", async () => {
      await dtuFetch(`/api/user/${MATT_USER_ID}/stack`, {
        method: "POST",
        body: JSON.stringify({ peloton_class_id: RIDE_CLIMB_45 }),
      });

      const stack = await dtuFetch<{
        classes: Array<{ id: string }>;
        total_classes: number;
      }>(`/api/user/${MATT_USER_ID}/stack`);

      expect(stack.total_classes).toBe(2);
      expect(stack.classes[0].id).toBe(RIDE_PZ_30);
      expect(stack.classes[1].id).toBe(RIDE_CLIMB_45);
    });

    it("should remove a ride from the stack", async () => {
      await dtuFetch(`/api/user/${MATT_USER_ID}/stack/${RIDE_PZ_30}`, {
        method: "DELETE",
      });

      const stack = await dtuFetch<{
        classes: Array<{ id: string }>;
        total_classes: number;
      }>(`/api/user/${MATT_USER_ID}/stack`);

      expect(stack.total_classes).toBe(1);
      expect(stack.classes[0].id).toBe(RIDE_CLIMB_45);
    });

    it("should reject adding a non-existent ride", async () => {
      const res = await fetch(`${DTU_URL}/api/user/${MATT_USER_ID}/stack`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${TOKEN_MATT}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ peloton_class_id: "nonexistent_ride_id_12345678" }),
      });
      expect(res.status).toBe(404);
    });

    it("should clear the stack via REST delete", async () => {
      await dtuFetch(`/api/user/${MATT_USER_ID}/stack/${RIDE_CLIMB_45}`, {
        method: "DELETE",
      });

      const stack = await dtuFetch<{
        classes: Array<{ id: string }>;
        total_classes: number;
      }>(`/api/user/${MATT_USER_ID}/stack`);

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
      }>(`/api/user/${MATT_USER_ID}/stack`);

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

      // Clean up
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

      // 281 * 0.95 = 266.95 → 267 = user.cycling_ftp
      expect(user.cycling_ftp).toBe(calculatedFtp);
    });

    it("seed data is consistent across both users", async () => {
      // Jane's FTP should also be calculable from her workout chain
      const jane = await dtuFetch<{
        cycling_ftp: number;
        cycling_ftp_workout_id: string;
      }>("/api/me", { token: TOKEN_JANE });

      const perf = await dtuFetch<{
        average_summaries: Array<{ slug: string; value: number }>;
      }>(`/api/workout/${jane.cycling_ftp_workout_id}/performance_graph`, {
        token: TOKEN_JANE,
      });

      const avgOutput = perf.average_summaries.find((s) => s.slug === "avg_output")!.value;
      const calculatedFtp = Math.round(avgOutput * 0.95);

      // 205 * 0.95 = 194.75 → 195 = jane.cycling_ftp
      expect(jane.cycling_ftp).toBe(calculatedFtp);
    });
  });
});

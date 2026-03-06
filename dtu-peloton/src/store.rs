use std::collections::HashMap;

use crate::models::*;

/// Seed data is embedded at compile time from seed.json so the DTU and
/// supabase/seed.sql share a single source of truth for Peloton entities.
const SEED_JSON: &str = include_str!("../seed.json");

pub struct Store {
    pub users: HashMap<String, User>,
    pub workouts: HashMap<String, Workout>,
    pub rides: HashMap<String, Ride>,
    pub performance_graphs: HashMap<String, PerformanceGraph>,
    pub instructors: HashMap<String, Instructor>,
    /// Per-user stack: user_id -> ordered list of ride IDs
    pub stacks: HashMap<String, Vec<String>>,
    /// Token -> user_id
    pub tokens: HashMap<String, String>,
}

impl Store {
    pub fn new() -> Self {
        let mut store = Store {
            users: HashMap::new(),
            workouts: HashMap::new(),
            rides: HashMap::new(),
            performance_graphs: HashMap::new(),
            instructors: HashMap::new(),
            stacks: HashMap::new(),
            tokens: HashMap::new(),
        };
        store.load_seed();
        store
    }

    fn load_seed(&mut self) {
        let seed: serde_json::Value =
            serde_json::from_str(SEED_JSON).expect("seed.json must be valid JSON");

        // --- Instructors ---
        let instr_map: HashMap<String, Instructor> = seed["instructors"]
            .as_array()
            .expect("instructors must be an array")
            .iter()
            .map(|v| {
                let instr = Instructor {
                    id: v["id"].as_str().unwrap().into(),
                    name: v["name"].as_str().unwrap().into(),
                    image_url: v["image_url"].as_str().unwrap().into(),
                };
                (instr.id.clone(), instr)
            })
            .collect();

        self.instructors = instr_map.clone();

        // --- Users ---
        for v in seed["users"].as_array().expect("users must be an array") {
            let user_id = v["id"].as_str().unwrap().to_string();
            let user = User {
                id: user_id.clone(),
                username: v["username"].as_str().unwrap().into(),
                email: v["email"].as_str().unwrap().into(),
                name: v["name"].as_str().unwrap().into(),
                image_url: v["image_url"].as_str().unwrap().into(),
                cycling_ftp: v["cycling_ftp"].as_u64().unwrap() as u32,
                cycling_ftp_source: v["cycling_ftp_source"].as_str().map(|s| s.into()),
                cycling_ftp_workout_id: v["cycling_ftp_workout_id"].as_str().map(|s| s.into()),
                estimated_cycling_ftp: v["estimated_cycling_ftp"].as_u64().map(|n| n as u32),
                created_at: v["created_at"].as_u64().unwrap(),
            };
            self.users.insert(user_id.clone(), user);

            // Auth token for this user
            let token = v["token"].as_str().unwrap().to_string();
            self.tokens.insert(token, user_id.clone());

            // Empty stack
            self.stacks.insert(user_id, Vec::new());
        }

        // --- Rides ---
        for v in seed["rides"].as_array().expect("rides must be an array") {
            let instr_id = v["instructor_id"].as_str().map(|s| s.to_string());
            let instructor = instr_id
                .as_ref()
                .and_then(|id| instr_map.get(id))
                .cloned();

            let ride = Ride {
                id: v["id"].as_str().unwrap().into(),
                title: v["title"].as_str().unwrap().into(),
                description: v["description"].as_str().unwrap().into(),
                duration: v["duration"].as_u64().unwrap() as u32,
                difficulty_estimate: v["difficulty_estimate"].as_f64().unwrap(),
                image_url: v["image_url"].as_str().unwrap().into(),
                instructor_id: instr_id,
                instructor,
                fitness_discipline: v["fitness_discipline"].as_str().unwrap().into(),
                fitness_discipline_display_name: v["fitness_discipline_display_name"]
                    .as_str()
                    .unwrap()
                    .into(),
            };
            self.rides.insert(ride.id.clone(), ride);
        }

        // --- Workouts + Performance Graphs ---
        for v in seed["workouts"]
            .as_array()
            .expect("workouts must be an array")
        {
            let workout_id = v["id"].as_str().unwrap().to_string();
            let ride_id = v["ride_id"].as_str().unwrap().to_string();
            let ride = self.rides.get(&ride_id).cloned();

            let ftp_info = v.get("ftp_info").and_then(|fi| {
                if fi.is_null() {
                    return None;
                }
                Some(FtpInfo {
                    ftp: fi["ftp"].as_u64().unwrap_or(0) as u32,
                    ftp_source: fi["ftp_source"].as_str().map(|s| s.into()),
                    ftp_workout_id: fi["ftp_workout_id"].as_str().map(|s| s.into()),
                })
            });

            let workout = Workout {
                id: workout_id.clone(),
                created_at: v["created_at"].as_u64().unwrap(),
                status: v["status"].as_str().unwrap().into(),
                fitness_discipline: v["fitness_discipline"].as_str().unwrap().into(),
                ride,
                ftp_info,
            };
            self.workouts.insert(workout_id.clone(), workout);

            // Performance graph (inline in the workout entry)
            if let Some(pg) = v.get("performance_graph") {
                if !pg.is_null() {
                    let graph = PerformanceGraph {
                        duration: pg["duration"].as_u64().unwrap() as u32,
                        average_summaries: pg["average_summaries"]
                            .as_array()
                            .unwrap()
                            .iter()
                            .map(|s| Summary {
                                display_name: s["display_name"].as_str().unwrap().into(),
                                display_unit: s["display_unit"].as_str().unwrap().into(),
                                value: s["value"].as_f64().unwrap(),
                                slug: s["slug"].as_str().unwrap().into(),
                            })
                            .collect(),
                        summaries: pg["summaries"]
                            .as_array()
                            .unwrap()
                            .iter()
                            .map(|s| Summary {
                                display_name: s["display_name"].as_str().unwrap().into(),
                                display_unit: s["display_unit"].as_str().unwrap().into(),
                                value: s["value"].as_f64().unwrap(),
                                slug: s["slug"].as_str().unwrap().into(),
                            })
                            .collect(),
                    };
                    self.performance_graphs.insert(workout_id, graph);
                }
            }
        }
    }
}

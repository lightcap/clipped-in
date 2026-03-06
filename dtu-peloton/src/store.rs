use std::collections::HashMap;

use crate::models::*;

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
        store.seed();
        store
    }

    fn seed(&mut self) {
        // --- Instructors ---
        let instr_a = Instructor {
            id: "1697e6f580494740a5a1ca62b8b3f47c".into(),
            name: "Alex Toussaint".into(),
            image_url: "https://example.com/instructors/alex.jpg".into(),
        };
        let instr_b = Instructor {
            id: "a8c56f162c964e9392568bc13828a3fb".into(),
            name: "Robin Arzón".into(),
            image_url: "https://example.com/instructors/robin.jpg".into(),
        };
        let instr_c = Instructor {
            id: "c9fa21c2004c4544a7c35c28a6196c77".into(),
            name: "Rad Lopez".into(),
            image_url: "https://example.com/instructors/rad.jpg".into(),
        };

        self.instructors.insert(instr_a.id.clone(), instr_a.clone());
        self.instructors.insert(instr_b.id.clone(), instr_b.clone());
        self.instructors.insert(instr_c.id.clone(), instr_c.clone());

        // --- User ---
        let user_id = "efcac68d7abf4b83a89d347416d76089".to_string();
        self.users.insert(
            user_id.clone(),
            User {
                id: user_id.clone(),
                username: "TestRider".into(),
                email: "test@example.com".into(),
                name: "Matt Test".into(),
                image_url: "https://example.com/profile.jpg".into(),
                cycling_ftp: 176,
                cycling_ftp_source: Some("ftp_workout_source".into()),
                cycling_ftp_workout_id: Some("4e77e9a27f074a509fe08d4eb41e6b36".into()),
                estimated_cycling_ftp: Some(199),
                created_at: 1577836800, // 2020-01-01
            },
        );

        // --- Auth token ---
        self.tokens.insert("test-token".into(), user_id.clone());

        // --- FTP Workout Chain ---
        // Workout 1: most recent FTP test (2026-01-14)
        let workout_1_id = "4e77e9a27f074a509fe08d4eb41e6b36".to_string();
        self.workouts.insert(
            workout_1_id.clone(),
            Workout {
                id: workout_1_id.clone(),
                created_at: 1736812800, // 2025-01-14
                status: "COMPLETE".into(),
                fitness_discipline: "cycling".into(),
                ride: Some(Ride {
                    id: "ftp_ride_001".into(),
                    title: "20 min FTP Test Ride".into(),
                    description: "Find your Functional Threshold Power.".into(),
                    duration: 1200,
                    difficulty_estimate: 8.5,
                    image_url: "https://example.com/rides/ftp-test.jpg".into(),
                    instructor_id: Some(instr_a.id.clone()),
                    instructor: Some(instr_a.clone()),
                    fitness_discipline: "cycling".into(),
                    fitness_discipline_display_name: "Cycling".into(),
                }),
                ftp_info: Some(FtpInfo {
                    ftp: 183, // baseline going INTO this test
                    ftp_source: Some("ftp_workout_source".into()),
                    ftp_workout_id: Some("096f513cf5914c0f8eef81c870e4779c".into()),
                }),
            },
        );
        self.performance_graphs.insert(
            workout_1_id,
            PerformanceGraph {
                duration: 1200,
                average_summaries: vec![
                    Summary {
                        display_name: "Avg Output".into(),
                        display_unit: "watts".into(),
                        value: 185.0, // FTP = 185 * 0.95 = 175.75 ≈ 176
                        slug: "avg_output".into(),
                    },
                    Summary {
                        display_name: "Avg Cadence".into(),
                        display_unit: "rpm".into(),
                        value: 85.0,
                        slug: "avg_cadence".into(),
                    },
                    Summary {
                        display_name: "Avg Resistance".into(),
                        display_unit: "%".into(),
                        value: 48.0,
                        slug: "avg_resistance".into(),
                    },
                ],
                summaries: vec![
                    Summary {
                        display_name: "Total Output".into(),
                        display_unit: "kj".into(),
                        value: 222.0,
                        slug: "total_output".into(),
                    },
                    Summary {
                        display_name: "Distance".into(),
                        display_unit: "mi".into(),
                        value: 6.8,
                        slug: "distance".into(),
                    },
                    Summary {
                        display_name: "Calories".into(),
                        display_unit: "kcal".into(),
                        value: 210.0,
                        slug: "calories".into(),
                    },
                ],
            },
        );

        // Workout 2: first FTP test (2019-12-04), baseline = 0
        let workout_2_id = "096f513cf5914c0f8eef81c870e4779c".to_string();
        self.workouts.insert(
            workout_2_id.clone(),
            Workout {
                id: workout_2_id.clone(),
                created_at: 1575417600, // 2019-12-04
                status: "COMPLETE".into(),
                fitness_discipline: "cycling".into(),
                ride: Some(Ride {
                    id: "ftp_ride_002".into(),
                    title: "20 min FTP Test Ride".into(),
                    description: "Find your Functional Threshold Power.".into(),
                    duration: 1200,
                    difficulty_estimate: 8.5,
                    image_url: "https://example.com/rides/ftp-test.jpg".into(),
                    instructor_id: Some(instr_a.id.clone()),
                    instructor: Some(instr_a.clone()),
                    fitness_discipline: "cycling".into(),
                    fitness_discipline_display_name: "Cycling".into(),
                }),
                ftp_info: Some(FtpInfo {
                    ftp: 0, // first test — no prior baseline
                    ftp_source: None,
                    ftp_workout_id: None,
                }),
            },
        );
        self.performance_graphs.insert(
            workout_2_id,
            PerformanceGraph {
                duration: 1200,
                average_summaries: vec![
                    Summary {
                        display_name: "Avg Output".into(),
                        display_unit: "watts".into(),
                        value: 193.0, // FTP = 193 * 0.95 = 183.35 ≈ 183
                        slug: "avg_output".into(),
                    },
                    Summary {
                        display_name: "Avg Cadence".into(),
                        display_unit: "rpm".into(),
                        value: 88.0,
                        slug: "avg_cadence".into(),
                    },
                ],
                summaries: vec![Summary {
                    display_name: "Total Output".into(),
                    display_unit: "kj".into(),
                    value: 231.0,
                    slug: "total_output".into(),
                }],
            },
        );

        // --- Sample Rides for Search ---
        let sample_rides = vec![
            Ride {
                id: "d46adf451aae41609125438c52823dc8".into(),
                title: "30 min Power Zone Ride".into(),
                description: "Train in your power zones for maximum gains.".into(),
                duration: 1800,
                difficulty_estimate: 7.2,
                image_url: "https://example.com/rides/pz-30.jpg".into(),
                instructor_id: Some(instr_a.id.clone()),
                instructor: Some(instr_a.clone()),
                fitness_discipline: "cycling".into(),
                fitness_discipline_display_name: "Cycling".into(),
            },
            Ride {
                id: "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6".into(),
                title: "45 min Climb Ride".into(),
                description: "Push through heavy resistance climbs.".into(),
                duration: 2700,
                difficulty_estimate: 8.1,
                image_url: "https://example.com/rides/climb-45.jpg".into(),
                instructor_id: Some(instr_b.id.clone()),
                instructor: Some(instr_b.clone()),
                fitness_discipline: "cycling".into(),
                fitness_discipline_display_name: "Cycling".into(),
            },
            Ride {
                id: "b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7".into(),
                title: "20 min HIIT Ride".into(),
                description: "High intensity intervals on the bike.".into(),
                duration: 1200,
                difficulty_estimate: 7.8,
                image_url: "https://example.com/rides/hiit-20.jpg".into(),
                instructor_id: Some(instr_a.id.clone()),
                instructor: Some(instr_a.clone()),
                fitness_discipline: "cycling".into(),
                fitness_discipline_display_name: "Cycling".into(),
            },
            Ride {
                id: "c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8".into(),
                title: "10 min Arms & Shoulders Strength".into(),
                description: "Grab your weights for an upper-body burn.".into(),
                duration: 600,
                difficulty_estimate: 5.5,
                image_url: "https://example.com/rides/arms-10.jpg".into(),
                instructor_id: Some(instr_c.id.clone()),
                instructor: Some(instr_c.clone()),
                fitness_discipline: "strength".into(),
                fitness_discipline_display_name: "Strength".into(),
            },
            Ride {
                id: "d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9".into(),
                title: "20 min Full Body Strength".into(),
                description: "A balanced full body workout.".into(),
                duration: 1200,
                difficulty_estimate: 6.3,
                image_url: "https://example.com/rides/fb-20.jpg".into(),
                instructor_id: Some(instr_c.id.clone()),
                instructor: Some(instr_c.clone()),
                fitness_discipline: "strength".into(),
                fitness_discipline_display_name: "Strength".into(),
            },
            Ride {
                id: "e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0".into(),
                title: "30 min Pop Ride".into(),
                description: "Ride to your favorite pop hits.".into(),
                duration: 1800,
                difficulty_estimate: 6.1,
                image_url: "https://example.com/rides/pop-30.jpg".into(),
                instructor_id: Some(instr_b.id.clone()),
                instructor: Some(instr_b.clone()),
                fitness_discipline: "cycling".into(),
                fitness_discipline_display_name: "Cycling".into(),
            },
            Ride {
                id: "f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1".into(),
                title: "45 min Power Zone Endurance Ride".into(),
                description: "Build endurance in zones 2-3.".into(),
                duration: 2700,
                difficulty_estimate: 6.8,
                image_url: "https://example.com/rides/pze-45.jpg".into(),
                instructor_id: Some(instr_a.id.clone()),
                instructor: Some(instr_a.clone()),
                fitness_discipline: "cycling".into(),
                fitness_discipline_display_name: "Cycling".into(),
            },
            Ride {
                id: "a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2".into(),
                title: "30 min Upper Body Strength".into(),
                description: "Heavy weights, upper body focus.".into(),
                duration: 1800,
                difficulty_estimate: 7.0,
                image_url: "https://example.com/rides/upper-30.jpg".into(),
                instructor_id: Some(instr_c.id.clone()),
                instructor: Some(instr_c.clone()),
                fitness_discipline: "strength".into(),
                fitness_discipline_display_name: "Strength".into(),
            },
            Ride {
                id: "b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3".into(),
                title: "10 min Cool Down Ride".into(),
                description: "Easy spin to cool down after your workout.".into(),
                duration: 600,
                difficulty_estimate: 3.2,
                image_url: "https://example.com/rides/cooldown-10.jpg".into(),
                instructor_id: Some(instr_b.id.clone()),
                instructor: Some(instr_b.clone()),
                fitness_discipline: "cycling".into(),
                fitness_discipline_display_name: "Cycling".into(),
            },
            Ride {
                id: "c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4".into(),
                title: "20 min Low Impact Ride".into(),
                description: "Low resistance, high cadence recovery ride.".into(),
                duration: 1200,
                difficulty_estimate: 5.0,
                image_url: "https://example.com/rides/lowimpact-20.jpg".into(),
                instructor_id: Some(instr_a.id.clone()),
                instructor: Some(instr_a.clone()),
                fitness_discipline: "cycling".into(),
                fitness_discipline_display_name: "Cycling".into(),
            },
        ];

        for ride in sample_rides {
            self.rides.insert(ride.id.clone(), ride);
        }

        // --- Empty stack for user ---
        self.stacks.insert(user_id, Vec::new());
    }
}

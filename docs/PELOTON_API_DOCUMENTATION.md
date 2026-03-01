# Unofficial Peloton API Documentation

## Overview

This document describes the unofficial Peloton API endpoints discovered through authenticated API exploration.

**API Base URL:** `https://api.onepeloton.com`
**Web App URL:** `https://members.onepeloton.com`

---

## Authentication

Peloton uses OAuth2 with Auth0:
- **Auth Domain:** `auth.onepeloton.com`
- **Client ID:** `WVoJxVDdPoFx4RNewvvg6ch2mZ7bwnsM`
- **Audience:** `https://api.onepeloton.com/`
- **Scopes:** `openid offline_access peloton-api.members:default`

The access token is a JWT that should be passed in the `Authorization: Bearer {token}` header.

### Required Headers

Some endpoints require additional headers:

| Header | Value | Required For |
|--------|-------|--------------|
| `Authorization` | `Bearer {token}` | All authenticated endpoints |
| `Peloton-Platform` | `web` | User overview, achievements, some user endpoints |
| `Content-Type` | `application/json` | POST/PUT requests with body |

---

## API Endpoints

### Class Listing
```
GET /api/v2/ride/archived
```

**Query Parameters:**
| Parameter | Type | Description | Example |
|-----------|------|-------------|---------|
| `browse_category` | string | Discipline slug | `strength`, `cycling`, `yoga` |
| `content_format` | string | Content type | `video` |
| `limit` | integer | Results per page | `20` |
| `page` | integer | Page number (0-indexed) | `0` |
| `sort_by` | string | Sort field | `original_air_time` |
| `desc` | boolean | Sort direction | `true` |
| `muscle_group` | string | Filter by muscle | `lats`, `biceps` |
| `duration` | integer | Duration in seconds | `1800` |
| `instructor_id` | string | Filter by instructor ID | `1697e6f580494740a5a1ca62b8b3f47c` |
| `q` | string | Search query | `Taylor%20Swift` |
| `is_favorite_ride` | string | Filter bookmarks | `["true"]` |

**Response:**
```json
{
  "data": [/* array of ride objects */],
  "page": 0,
  "total": 5000,
  "count": 20,
  "page_count": 250,
  "show_previous": false,
  "show_next": true,
  "sort_by": "original_air_time",
  "instructors": [/* instructor objects */],
  "ride_types": [/* ride type objects */],
  "class_types": [/* class type objects */],
  "browse_categories": [/* category objects */],
  "fitness_disciplines": [/* discipline objects */]
}
```

---

### Class Details
```
GET /api/ride/{classId}/details
```

**Response Schema:**
```json
{
  "ride": {/* ride object with full details */},
  "class_types": [/* class type metadata */],
  "playlist": {
    "songs": [/* song objects with timing */]
  },
  "averages": {/* aggregate statistics */},
  "segments": {
    "segment_list": [/* detailed segment/exercise data */],
    "segment_category_distribution": {"Upper_Body": "0.9", "Floor Warmup": "0.1"},
    "segment_body_focus_distribution": {"chest": "0.9", "arms": "0.9", "back": "0.9"},
    "movements_by_weight_category": {
      "heavy": ["Bent Over Row"],
      "medium": ["Neutral Grip Chest Press"],
      "body_weight": ["Push Up"]
    }
  },
  "instructor_cues": [/* timing cues */],
  "target_metrics_data": {/* target metrics */},
  "related_rides": [/* similar classes */]
}
```

---

### Live/Scheduled Classes
```
GET /api/v2/ride/live
```

Returns upcoming live and scheduled classes.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Results per page |

**Response:**
```json
{
  "total": 132,
  "count": 132,
  "sort_by": "scheduled_start_time",
  "data": [
    {
      "id": "f496a6d68ad94c3b8174be16a3b94cfb",
      "title": "60 min Schlager Ride",
      "scheduled_start_time": 1768636800,
      "instructor_id": "accfd3433b064508845d7696dab959fd",
      "fitness_discipline": "cycling",
      "duration": 3600,
      "sold_out": false,
      "total_home_reservations": 250,
      "home_peloton_status": "pending",
      "authed_user_reservation_id": null
    }
  ]
}
```

---

### Current User Profile
```
GET /api/me
```

Returns the authenticated user's profile and settings.

**Response:**
```json
{
  "id": "efcac68d7abf4b83a89d347416d76089",
  "username": "RiverVue",
  "email": "user@example.com",
  "name": "First Last",
  "first_name": "First",
  "last_name": "Last",
  "gender": "female",
  "birthday": 180662400,
  "height": 69,
  "weight": 145,
  "location": "Oregon",
  "image_url": "https://s3.amazonaws.com/peloton-profile-images/...",
  "total_workouts": 1595,
  "total_followers": 11,
  "total_following": 10,
  "cycling_ftp": 173,
  "default_heart_rate_zones": [0, 110.5, 127.5, 144.5, 161.5],
  "default_max_heart_rate": 170,
  "workout_counts": [
    {"name": "Cycling", "slug": "cycling", "count": 637},
    {"name": "Strength", "slug": "strength", "count": 419}
  ],
  "external_music_auth_list": [
    {"provider": "spotify", "status": "connected", "email": "user@example.com"}
  ],
  "paired_devices": [
    {"name": "Heart Rate Monitor", "paired_device_type": "heart_rate_monitor"}
  ],
  "is_strava_authenticated": true,
  "is_profile_private": true
}
```

---

### Instructors List
```
GET /api/instructor
```

Returns all instructors.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Results per page (default 100) |

**Response:**
```json
{
  "total": 57,
  "data": [
    {
      "id": "b8c2734e18a7496fa146b3a42465da67",
      "name": "Aditi Shah",
      "fitness_disciplines": ["meditation", "strength", "yoga"]
    }
  ]
}
```

---

### User Overview
```
GET /api/user/{user_id}/overview
```

**Required Headers:** `Peloton-Platform: web`

Returns comprehensive user statistics and recent activity.

**Response includes:**
- Workout counts by discipline
- Streak information
- Personal records
- Recent achievements
- Following activity

---

### User Achievements
```
GET /api/user/{user_id}/achievements
```

**Required Headers:** `Peloton-Platform: web`

**Response:**
```json
{
  "categories": [
    {
      "name": "Special Events",
      "slug": "special_events",
      "achievements": [
        {
          "count": 1,
          "template": {
            "id": "46ea3f625cb6414b9053cd58a1de20ec",
            "name": "F1 Las Vegas Grand Prix 2025",
            "slug": "f1_lasvegas_grand_prix",
            "image_url": "https://s3.amazonaws.com/peloton-achievement-images-prod/...",
            "description": "Awarded for taking an F1 Las Vegas Grand Prix 2025 class."
          }
        }
      ]
    },
    {
      "name": "Workout Milestones",
      "slug": "workout_milestones",
      "achievements": [/* milestone achievements */]
    }
  ]
}
```

---

### User Challenges
```
GET /api/user/{user_id}/challenges/current
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `has_joined` | boolean | Filter by joined status (required) |

**Response:**
```json
{
  "challenges": [
    {
      "challenge_summary": {
        "id": "67bfab351b6f4e239ed17aadf28c006e",
        "title": "The Annual 2026",
        "challenge_type": "individual",
        "description": "...",
        "start_time": 1735689600,
        "end_time": 1767225599,
        "background_image_url": "https://..."
      },
      "participants": {"total_count": 464523},
      "progress": {
        "current_tier": {
          "metric_display_value": "0",
          "metric_display_unit": "min"
        }
      }
    }
  ]
}
```

---

## Write APIs (POST/PUT/DELETE)

### Favorites

**Check Favorite Status:**
```
GET /api/favorites/{ride_id}
```
Response: `{"is_favorite": false}`

**Add to Favorites (Bookmark):**
```
POST /api/favorites/create
Content-Type: application/json

{"ride_id": "d46adf451aae41609125438c52823dc8"}
```

**Remove from Favorites:**
```
POST /api/favorites/delete
Content-Type: application/json

{"ride_id": "d46adf451aae41609125438c52823dc8"}
```

---

### Challenge Join
```
POST /api/user/{user_id}/challenge/{challenge_id}/join
```

**Response:**
```json
{
  "participants": {"total_count": 464523},
  "progress": {
    "current_tier": {
      "metric_display_value": "0",
      "metric_display_unit": "min"
    }
  }
}
```

---

## GraphQL API (Stack/Queue)

The Stack functionality uses a separate GraphQL endpoint.

**Endpoint:** `https://gql-graphql-gateway.prod.k8s.onepeloton.com/graphql`

**Headers:**
```
Authorization: Bearer {access_token}
Content-Type: application/json
```

### Peloton Class ID Encoding

The GraphQL API uses base64-encoded class identifiers:

```javascript
const classInfo = {
  home_peloton_id: null,      // null for on-demand classes
  ride_id: "d46adf451aae41609125438c52823dc8",  // The class ID
  studio_peloton_id: null,    // null for on-demand classes
  type: "on_demand"           // "on_demand" or "live"
};
const pelotonClassId = btoa(JSON.stringify(classInfo));
// Result: "eyJob21lX3BlbG90b25faWQiOiBudWxsLCAicmlkZV9pZCI6ICJkNDZhZGY0NTFhYWU0MTYwOTEyNTQzOGM1MjgyM2RjOCIsICJzdHVkaW9fcGVsb3Rvbl9pZCI6IG51bGwsICJ0eXBlIjogIm9uX2RlbWFuZCJ9"
```

### View User Stack

```graphql
query ViewUserStack {
  viewUserStack {
    numClasses
    totalTime
    ... on StackResponseSuccess {
      userStack {
        stackedClassList {
          playOrder
          pelotonClass {
            classId
            title
            duration
            fitnessDiscipline { slug displayName }
            instructor { name }
            difficultyLevel { slug displayName }
            airTime
          }
        }
      }
    }
  }
}
```

**Response:**
```json
{
  "data": {
    "viewUserStack": {
      "numClasses": 1,
      "totalTime": 600,
      "userStack": {
        "stackedClassList": [
          {
            "playOrder": 0,
            "pelotonClass": {
              "classId": "d46adf451aae41609125438c52823dc8",
              "title": "10 min Arms & Shoulders Strength",
              "duration": 600
            }
          }
        ]
      }
    }
  }
}
```

### Add Class to Stack

```graphql
mutation AddClassToStack($input: AddClassToStackInput!) {
  addClassToStack(input: $input) {
    numClasses
    totalTime
    userStack {
      stackedClassList {
        playOrder
        pelotonClass {
          classId
          title
          duration
        }
      }
    }
  }
}
```

**Variables:**
```json
{
  "input": {
    "pelotonClassId": "eyJob21lX3BlbG90b25faWQiOiBudWxsLCAicmlkZV9pZCI6ICJkNDZhZGY0NTFhYWU0MTYwOTEyNTQzOGM1MjgyM2RjOCIsICJzdHVkaW9fcGVsb3Rvbl9pZCI6IG51bGwsICJ0eXBlIjogIm9uX2RlbWFuZCJ9"
  }
}
```

### Modify Stack (Reorder/Remove/Clear)

Replaces the entire stack with a new ordered list. Use to:
- Remove a class (provide list without that class)
- Reorder classes (provide list in new order)
- Clear stack (provide empty list)

```graphql
mutation ModifyStack($input: ModifyStackInput!) {
  modifyStack(input: $input) {
    numClasses
    totalTime
    userStack {
      stackedClassList {
        playOrder
        pelotonClass {
          classId
          title
        }
      }
    }
  }
}
```

**Variables (clear stack):**
```json
{
  "input": {
    "pelotonClassIdList": []
  }
}
```

**Variables (set specific classes in order):**
```json
{
  "input": {
    "pelotonClassIdList": [
      "base64-encoded-class-1",
      "base64-encoded-class-2"
    ]
  }
}
```

### Check if Class in Stack

```graphql
query CheckDoesClassExistInUserStack($input: ID!) {
  checkDoesClassExistInUserStack(pelotonClassId: $input)
}
```

**Variables:**
```json
{
  "input": "base64-encoded-class-id"
}
```

**Response:**
```json
{
  "data": {
    "checkDoesClassExistInUserStack": true
  }
}
```

### Other GraphQL Operations

Based on error messages, these additional operations exist:
- `playClassFromStack` - Start playing a class from the stack
- `removeClassFromSchedule` - Remove scheduled class
- `removeTagFromUser` - Remove tag from user

---

## Ride Object Schema

```json
{
  "id": "d46adf451aae41609125438c52823dc8",
  "title": "10 min Arms & Shoulders Strength",
  "description": "Grab your weights and join us for an upper-body workout...",
  "fitness_discipline": "strength",
  "fitness_discipline_display_name": "Strength",
  "difficulty_estimate": 6.104,
  "difficulty_level": "intermediate",
  "difficulty_rating_avg": 6.104,
  "difficulty_rating_count": 48,
  "duration": 600,
  "length": 797,
  "original_air_time": 1768672944,
  "instructor_id": "1697e6f580494740a5a1ca62b8b3f47c",
  "language": "english",
  "origin_locale": "en-US",
  "has_closed_captions": true,
  "captions": ["en-US", "es-ES"],
  "is_explicit": true,
  "explicit_rating": 1,
  "image_url": "https://s3.amazonaws.com/peloton-ride-images/...",
  "vod_stream_url": "https://amd-vod.akamaized.net/classes/...",
  "total_workouts": 500,
  "total_ratings": 323,
  "overall_rating_avg": 1,
  "equipment_tags": [
    {
      "id": "0f5f1ff2d6c647cf98d599ed90ad72d3",
      "name": "Light Dumbbells",
      "slug": "light_weights",
      "icon_url": "https://s3.amazonaws.com/static-cdn.pelotoncycle.com/equipment-icons/light_weights.png"
    }
  ],
  "muscle_group_score": [/* see Muscle Group Schema */],
  "class_type_ids": ["d2f2f12b633140079d03291738cec418"],
  "ride_type_ids": ["d2f2f12b633140079d03291738cec418"],
  "metrics": ["heart_rate", "calories"],
  "flags": ["is_mfrc", "has_form_feedback", "show_mt_icon"],
  "is_favorite": false,
  "total_user_workouts": 0,
  "total_following_workouts": 0
}
```

---

## Muscle Group Schema

**16 Granular Muscle Groups Available:**

| Slug | Display Name | Body Region |
|------|--------------|-------------|
| `biceps` | Biceps | Arms |
| `triceps` | Triceps | Arms |
| `forearms` | Forearms | Arms |
| `shoulders` | Shoulders | Upper Body |
| `chest` | Chest | Upper Body |
| `lats` | Lats | Back |
| `mid_back` | Mid Back | Back |
| `low_back` | Low Back | Back |
| `traps` | Traps | Back/Shoulders |
| `core` | Core | Torso |
| `obliques` | Obliques | Torso |
| `glutes` | Glutes | Lower Body |
| `quads` | Quads | Lower Body |
| `hamstrings` | Hamstrings | Lower Body |
| `calves` | Calves | Lower Body |
| `hips` | Hips | Lower Body |

**Class-Level Muscle Score:**
```json
{
  "muscle_group_score": [
    {
      "muscle_group": "lats",
      "display_name": "Lats",
      "score": 945,
      "percentage": 15,
      "bucket": 3
    },
    {
      "muscle_group": "mid_back",
      "display_name": "Mid Back",
      "score": 650,
      "percentage": 10,
      "bucket": 2
    },
    {
      "muscle_group": "low_back",
      "display_name": "Low Back",
      "score": 290,
      "percentage": 5,
      "bucket": 1
    }
  ]
}
```

**Bucket Values:**
- `3` = Primary muscle group (highest focus)
- `2` = Secondary muscle group
- `1` = Minor/supporting muscle group

---

## Movement/Exercise Schema

Each class segment contains individual movements with per-exercise muscle data:

```json
{
  "segments": {
    "segment_list": [
      {
        "id": "aeb06effc468402c8b8031dfb752a88e",
        "name": "Upper Body",
        "length": 480,
        "start_time_offset": 120,
        "icon_slug": "upper_body",
        "subsegments_v2": [
          {
            "id": "830730ebe3fd49fa93e2dfe4750372c5",
            "type": "movement",
            "display_name": "Renegade Row",
            "scheduled_offset": 0,
            "length": 30,
            "movements": [
              {
                "id": "abc123",
                "name": "Renegade Row",
                "slug": "renegade_row",
                "skill_level": "intermediate",
                "muscle_groups": [
                  {"muscle_group": "lats", "display_name": "Lats", "ranking": 3},
                  {"muscle_group": "core", "display_name": "Core", "ranking": 3},
                  {"muscle_group": "obliques", "display_name": "Obliques", "ranking": 3},
                  {"muscle_group": "biceps", "display_name": "Biceps", "ranking": 2},
                  {"muscle_group": "chest", "display_name": "Chest", "ranking": 2},
                  {"muscle_group": "mid_back", "display_name": "Mid Back", "ranking": 2},
                  {"muscle_group": "shoulders", "display_name": "Shoulders", "ranking": 2}
                ],
                "short_video_url": null,
                "long_video_url": null,
                "image_url": null,
                "is_rest": false
              }
            ]
          }
        ]
      }
    ]
  }
}
```

**Ranking Values:**
- `3` = Primary target muscle
- `2` = Secondary/supporting muscle
- `1` = Minor engagement

---

## Playlist Schema

```json
{
  "playlist": {
    "songs": [
      {
        "id": "84d49f40bf914eeba5abcb26d2f81343",
        "title": "Witchy (feat. Childish Gambino)",
        "artists": [
          {
            "artist_id": "92afa703073144f9a74ca574a3a40c17",
            "artist_name": "KAYTRANADA",
            "image_url": "https://images.music.onepeloton.com/...",
            "num_rides_with_song_played": 561
          }
        ],
        "album": {
          "id": "9ad33e3faf6940deac50a46ce41ac873",
          "name": "TIMELESS",
          "image_url": "https://images.music.onepeloton.com/..."
        },
        "explicit_rating": 1,
        "genres": [{"name": "electronic"}],
        "cue_time_offset": 30,
        "start_time_offset": 30,
        "index": 0,
        "liked": false
      }
    ]
  }
}
```

---

## Instructor Endpoint

```
GET /api/instructor/{instructor_id}
```

**Response:**
```json
{
  "id": "1697e6f580494740a5a1ca62b8b3f47c",
  "name": "Rad Lopez",
  "first_name": "Rad",
  "last_name": "Lopez",
  "username": "peloton_r",
  "bio": "Rad was born and raised in the Bronx, NY...",
  "quote": ""Lead with love. Lead with gratitude."",
  "is_active": true,
  "is_filterable": true,
  "fitness_disciplines": ["cardio", "strength", "stretching"],
  "image_url": "https://s3.amazonaws.com/workout-metric-images-prod/...",
  "life_style_image_url": "https://s3.amazonaws.com/workout-metric-images-prod/...",
  "instagram_profile": "",
  "spotify_playlist_uri": null,
  "ordered_q_and_as": [
    ["How do you motivate?", "I help you build a bigger sense of confidence..."]
  ]
}
```

---

## User Workout History

```
GET /api/user/{user_id}/workouts
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `limit` | integer | Results per page |
| `page` | integer | Page number |
| `sort_by` | string | Sort field (e.g., `-created` for newest first) |

**Response:**
```json
{
  "data": [/* workout objects */],
  "total": 1595,
  "page": 0,
  "count": 20,
  "summary": {/* aggregate stats */},
  "aggregate_stats": {/* lifetime stats */},
  "total_heart_rate_zone_durations": {/* HR zone totals */}
}
```

**Workout Object:**
```json
{
  "id": "45761442b2b34d63bd50d7a53ed3225c",
  "created_at": 1768591228,
  "start_time": 1768591228,
  "end_time": 1768594096,
  "device_type": "home_bike_plus",
  "fitness_discipline": "cycling",
  "status": "COMPLETE",
  "total_work": 364758.95,
  "peloton_id": "ff81710cdf614628a16fe97dc7708d34",
  "effort_zones": {
    "total_effort_points": 31.5,
    "heart_rate_zone_durations": {
      "heart_rate_z1_duration": 315,
      "heart_rate_z2_duration": 1760,
      "heart_rate_z3_duration": 617,
      "heart_rate_z4_duration": 0,
      "heart_rate_z5_duration": 0
    }
  }
}
```

---

## Workout Performance Data

```
GET /api/workout/{workout_id}/performance_graph
```

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| `every_n` | integer | Sample interval in seconds (e.g., `60` for per-minute data) |

**Response:**
```json
{
  "duration": 2700,
  "metrics": [
    {
      "display_name": "Output",
      "display_unit": "watts",
      "values": [112, 101, 104, 135, 142, ...],
      "max_value": 168,
      "average_value": 135
    },
    {
      "display_name": "Cadence",
      "display_unit": "rpm",
      "values": [99, 89, 91, 85, 88, ...]
    },
    {
      "display_name": "Resistance",
      "display_unit": "%",
      "values": [35, 35, 35, 40, 42, ...]
    },
    {
      "display_name": "Speed",
      "display_unit": "mph",
      "values": [17, 16.3, 16.5, 18.1, ...]
    },
    {
      "display_name": "Heart Rate",
      "display_unit": "bpm",
      "values": [108, 108, 109, 115, ...]
    }
  ],
  "summaries": [
    {"display_name": "Total Output", "display_unit": "kj", "value": 365, "slug": "total_output"},
    {"display_name": "Distance", "display_unit": "mi", "value": 13.70317, "slug": "distance"},
    {"display_name": "Calories", "display_unit": "kcal", "value": 322, "slug": "calories"}
  ],
  "average_summaries": [
    {"display_name": "Avg Output", "display_unit": "watts", "value": 135, "slug": "avg_output"},
    {"display_name": "Avg Cadence", "display_unit": "rpm", "value": 83, "slug": "avg_cadence"},
    {"display_name": "Avg Resistance", "display_unit": "%", "value": 42, "slug": "avg_resistance"},
    {"display_name": "Avg Speed", "display_unit": "mph", "value": 18.3, "slug": "avg_speed"}
  ],
  "effort_zones": {/* HR zone data */},
  "muscle_group_score": [/* workout-specific muscle engagement */],
  "segment_list": [/* class segments with timing */]
}
```

---

## Browse Categories

Available discipline slugs for filtering:

| Display Name | Slug | API ID |
|--------------|------|--------|
| Running | `running` | `2e56ee670dd34cc9bbc95d3704ca90ad` |
| Outdoor | `outdoor` | `94b0c6ff26c844cc8adbfdb07b9b3814` |
| Cycling | `cycling` | `dfcaa3e323ee464b9498e8818daa0784` |
| Strength | `strength` | `f24e8ddbc6314da29c1980c65e8989e7` |
| Yoga | `yoga` | `bf8702474a5a4ec9b36b143a6a9dd3a1` |
| Meditation | `meditation` | `945f74385ce14e19bb554c6664a24a73` |
| Stretching | `stretching` | `70ced881326143949b1313534ec15871` |
| Tread Bootcamp | `bootcamp` | `8a0ea0583ecf40a09c0e19d1c798c53e` |
| Walking | `walking` | `072fb234a6c14b29a0e7ec3c2d0f090d` |
| Cardio | `cardio` | `946ed9ed0489457a8da22f6a03ed66d1` |
| Bike Bootcamp | `bike_bootcamp` | `db7d4efd5ba44af0a376a7bd10105e0c` |
| Rowing | `caesar` | `bcc0525de1f94749b467bea5659c30f3` |
| Row Bootcamp | `caesar_bootcamp` | `49efd6fba5594b5681faba3014c05aaa` |

---

## ID Formats

| Entity | Format | Example |
|--------|--------|---------|
| Class/Ride ID | 32-char hex | `d46adf451aae41609125438c52823dc8` |
| Workout ID | 32-char hex | `45761442b2b34d63bd50d7a53ed3225c` |
| Instructor ID | 32-char hex | `1697e6f580494740a5a1ca62b8b3f47c` |
| User ID | 32-char hex | `efcac68d7abf4b83a89d347416d76089` |
| Song ID | 32-char hex | `84d49f40bf914eeba5abcb26d2f81343` |
| Artist ID | 32-char hex | `92afa703073144f9a74ca574a3a40c17` |

---

## Companion App Considerations

### Key Features for Class Search:
1. **Granular Muscle Filtering** - Filter by any of the 16 muscle groups
2. **Per-Exercise Data** - Access individual movements with muscle targeting info
3. **Playlist Search** - Search by artist, song, or genre via `q` parameter
4. **Movement Categorization** - Filter by weight category (heavy/medium/bodyweight)
5. **Time-Series Performance** - Full workout metrics at configurable intervals
6. **Bookmarks** - Use `is_favorite_ride=["true"]` filter on class listing
7. **Live Schedule** - `/api/v2/ride/live` for upcoming classes

### Write Operations Available:
- **Favorites/Bookmarks** - Add/remove classes from bookmarks
- **Challenges** - Join available challenges
- **Note:** Stack (queue) API endpoints were not discovered - may use GraphQL or different service

### Authentication Notes:
- Store OAuth tokens securely
- Tokens include `refresh_token` for renewal
- Access tokens expire (check `expires_in` field)
- Audience must be `https://api.onepeloton.com/`
- Some endpoints require `Peloton-Platform: web` header

### Rate Limiting:
- Unknown limits - implement conservative pacing
- Consider caching class catalog data
- Workout data is user-specific and should be fetched on-demand

---

## Disclaimer

This documentation is based on reverse-engineering the Peloton web application. The API is unofficial, undocumented, and subject to change without notice. Use responsibly and respect Peloton's terms of service.

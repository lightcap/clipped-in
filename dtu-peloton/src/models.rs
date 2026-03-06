use serde::{Deserialize, Serialize};

// --- User ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: String,
    pub username: String,
    pub email: String,
    pub name: String,
    pub image_url: String,
    pub cycling_ftp: u32,
    pub cycling_ftp_source: Option<String>,
    pub cycling_ftp_workout_id: Option<String>,
    pub estimated_cycling_ftp: Option<u32>,
    pub created_at: u64,
}

// --- Workout ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Workout {
    pub id: String,
    pub created_at: u64,
    pub status: String,
    pub fitness_discipline: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ride: Option<Ride>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ftp_info: Option<FtpInfo>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FtpInfo {
    pub ftp: u32,
    pub ftp_source: Option<String>,
    pub ftp_workout_id: Option<String>,
}

// --- Ride (Class) ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Ride {
    pub id: String,
    pub title: String,
    pub description: String,
    pub duration: u32,
    pub difficulty_estimate: f64,
    pub image_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instructor_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instructor: Option<Instructor>,
    pub fitness_discipline: String,
    pub fitness_discipline_display_name: String,
}

// --- Instructor ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Instructor {
    pub id: String,
    pub name: String,
    pub image_url: String,
}

// --- Performance Graph ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PerformanceGraph {
    pub duration: u32,
    pub average_summaries: Vec<Summary>,
    pub summaries: Vec<Summary>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Summary {
    pub display_name: String,
    pub display_unit: String,
    pub value: f64,
    pub slug: String,
}

// --- Search ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResponse {
    pub data: Vec<Ride>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instructors: Option<Vec<Instructor>>,
    pub page: u32,
    pub page_count: u32,
    pub total: u32,
    pub limit: u32,
}

// --- Workout List ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkoutListResponse {
    pub data: Vec<Workout>,
    pub page: u32,
    pub page_count: u32,
}

// --- Stack (REST) ---

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StackClass {
    pub id: String,
    pub peloton_id: String,
    pub title: String,
    pub duration: u32,
    pub image_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instructor: Option<Instructor>,
    pub fitness_discipline: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Stack {
    pub id: String,
    pub classes: Vec<StackClass>,
    pub total_classes: u32,
}

// --- GraphQL ---

#[derive(Debug, Clone, Deserialize)]
pub struct GraphQLRequest {
    pub query: String,
    #[serde(default)]
    pub variables: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GraphQLResponse {
    pub data: serde_json::Value,
}

#[derive(Debug, Clone, Serialize)]
pub struct GraphQLStackedClass {
    #[serde(rename = "playOrder")]
    pub play_order: u32,
    #[serde(rename = "pelotonClass")]
    pub peloton_class: GraphQLPelotonClass,
}

#[derive(Debug, Clone, Serialize)]
pub struct GraphQLPelotonClass {
    #[serde(rename = "classId")]
    pub class_id: String,
    pub title: String,
    pub duration: u32,
    #[serde(rename = "fitnessDiscipline", skip_serializing_if = "Option::is_none")]
    pub fitness_discipline: Option<GraphQLFitnessDiscipline>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instructor: Option<GraphQLInstructor>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GraphQLFitnessDiscipline {
    pub slug: String,
    #[serde(rename = "displayName")]
    pub display_name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct GraphQLInstructor {
    pub name: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct GraphQLStackResponse {
    #[serde(rename = "numClasses")]
    pub num_classes: u32,
    #[serde(rename = "totalTime")]
    pub total_time: u32,
    #[serde(rename = "userStack")]
    pub user_stack: Option<GraphQLUserStack>,
}

#[derive(Debug, Clone, Serialize)]
pub struct GraphQLUserStack {
    #[serde(rename = "stackedClassList")]
    pub stacked_class_list: Vec<GraphQLStackedClass>,
}

// --- GraphQL Input Types ---

#[derive(Debug, Clone, Deserialize)]
pub struct AddClassToStackInput {
    #[serde(rename = "pelotonClassId")]
    pub peloton_class_id: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ModifyStackInput {
    #[serde(rename = "pelotonClassIdList")]
    pub peloton_class_id_list: Vec<String>,
}

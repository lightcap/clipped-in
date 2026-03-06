use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::auth::AuthUser;
use crate::models::{Stack, StackClass};
use crate::AppState;
use axum::Extension;

#[derive(Debug, Deserialize)]
pub struct AddToStackBody {
    pub peloton_class_id: String,
}

pub async fn get_stack(
    State(state): State<AppState>,
    Extension(AuthUser(user)): Extension<AuthUser>,
    Path(_user_id): Path<String>,
) -> Json<Stack> {
    let store = state.read().await;
    let ride_ids = store.stacks.get(&user.id).cloned().unwrap_or_default();

    let classes: Vec<StackClass> = ride_ids
        .iter()
        .filter_map(|rid| {
            store.rides.get(rid).map(|r| StackClass {
                id: r.id.clone(),
                peloton_id: r.id.clone(),
                title: r.title.clone(),
                duration: r.duration,
                image_url: r.image_url.clone(),
                instructor: r.instructor.clone(),
                fitness_discipline: r.fitness_discipline.clone(),
            })
        })
        .collect();

    let total = classes.len() as u32;
    Json(Stack {
        id: format!("stack-{}", user.id),
        classes,
        total_classes: total,
    })
}

pub async fn add_to_stack(
    State(state): State<AppState>,
    Extension(AuthUser(user)): Extension<AuthUser>,
    Path(_user_id): Path<String>,
    Json(body): Json<AddToStackBody>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    let mut store = state.write().await;

    // Verify ride exists
    if !store.rides.contains_key(&body.peloton_class_id) {
        return Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error": "Class not found"})),
        ));
    }

    let stack = store.stacks.entry(user.id.clone()).or_default();

    // Don't add duplicates
    if !stack.contains(&body.peloton_class_id) {
        stack.push(body.peloton_class_id);
    }

    Ok((StatusCode::OK, Json(json!({"success": true}))))
}

pub async fn remove_from_stack(
    State(state): State<AppState>,
    Extension(AuthUser(user)): Extension<AuthUser>,
    Path((_user_id, class_id)): Path<(String, String)>,
) -> Result<(StatusCode, Json<Value>), (StatusCode, Json<Value>)> {
    let mut store = state.write().await;

    if let Some(stack) = store.stacks.get_mut(&user.id) {
        stack.retain(|id| id != &class_id);
    }

    Ok((StatusCode::OK, Json(json!({"success": true}))))
}

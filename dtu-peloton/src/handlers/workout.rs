use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde_json::{json, Value};

use crate::AppState;
use crate::models::{PerformanceGraph, Workout};

pub async fn get_workout(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Workout>, (StatusCode, Json<Value>)> {
    let store = state.read().await;
    match store.workouts.get(&id) {
        Some(w) => Ok(Json(w.clone())),
        None => Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error_code": "not_found", "message": "Workout not found"})),
        )),
    }
}

pub async fn get_performance_graph(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<PerformanceGraph>, (StatusCode, Json<Value>)> {
    let store = state.read().await;
    match store.performance_graphs.get(&id) {
        Some(pg) => Ok(Json(pg.clone())),
        None => Err((
            StatusCode::NOT_FOUND,
            Json(json!({"error_code": "not_found", "message": "Performance graph not found"})),
        )),
    }
}

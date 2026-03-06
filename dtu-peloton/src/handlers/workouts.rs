use axum::{
    extract::{Path, Query, State},
    Json,
};
use serde::Deserialize;

use crate::AppState;
use crate::models::WorkoutListResponse;

#[derive(Debug, Deserialize)]
pub struct WorkoutsQuery {
    pub limit: Option<u32>,
    pub page: Option<u32>,
    pub joins: Option<String>,
}

pub async fn get_user_workouts(
    State(state): State<AppState>,
    Path(_user_id): Path<String>,
    Query(query): Query<WorkoutsQuery>,
) -> Json<WorkoutListResponse> {
    let store = state.read().await;
    let limit = query.limit.unwrap_or(20).min(100);
    let page = query.page.unwrap_or(0);

    // Collect all workouts sorted by created_at descending
    let mut workouts: Vec<_> = store.workouts.values().cloned().collect();
    workouts.sort_by(|a, b| b.created_at.cmp(&a.created_at));

    let total = workouts.len() as u32;
    let page_count = (total + limit - 1) / limit;

    let start = (page * limit) as usize;
    let data: Vec<_> = workouts.into_iter().skip(start).take(limit as usize).collect();

    Json(WorkoutListResponse {
        data,
        page,
        page_count,
    })
}

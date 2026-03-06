use axum::{
    extract::{Query, State},
    Json,
};
use serde::Deserialize;

use crate::AppState;
use crate::models::SearchResponse;

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub browse_category: Option<String>,
    pub fitness_discipline: Option<String>,
    pub content_format: Option<String>,
    pub instructor_id: Option<String>,
    pub sort_by: Option<String>,
    pub duration: Option<Vec<u32>>,
    pub limit: Option<u32>,
    pub page: Option<u32>,
    pub joins: Option<String>,
}

pub async fn search_rides(
    State(state): State<AppState>,
    Query(query): Query<SearchQuery>,
) -> Json<SearchResponse> {
    let store = state.read().await;
    let limit = query.limit.unwrap_or(20).min(100);
    let page = query.page.unwrap_or(0);

    // Filter rides
    let mut rides: Vec<_> = store
        .rides
        .values()
        .filter(|r| {
            // Filter by discipline (browse_category or fitness_discipline)
            if let Some(ref cat) = query.browse_category {
                if r.fitness_discipline != *cat {
                    return false;
                }
            }
            if let Some(ref disc) = query.fitness_discipline {
                if r.fitness_discipline != *disc {
                    return false;
                }
            }
            // Filter by instructor
            if let Some(ref instr) = query.instructor_id {
                if r.instructor_id.as_ref() != Some(instr) {
                    return false;
                }
            }
            // Filter by duration
            if let Some(ref durations) = query.duration {
                if !durations.is_empty() && !durations.contains(&r.duration) {
                    return false;
                }
            }
            true
        })
        .cloned()
        .collect();

    // Sort (default: by title for determinism)
    rides.sort_by(|a, b| a.title.cmp(&b.title));

    let total = rides.len() as u32;
    let page_count = if total == 0 { 0 } else { (total + limit - 1) / limit };

    let start = (page * limit) as usize;
    let data: Vec<_> = rides.into_iter().skip(start).take(limit as usize).collect();

    // Collect unique instructors from results
    let instructors: Vec<_> = store.instructors.values().cloned().collect();

    Json(SearchResponse {
        data,
        instructors: Some(instructors),
        page,
        page_count,
        total,
        limit,
    })
}

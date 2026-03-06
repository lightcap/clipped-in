use axum::{
    extract::State,
    http::Uri,
    Json,
};

use crate::AppState;
use crate::models::SearchResponse;

/// Parse query params manually to support Peloton's repeated-key format
/// (e.g. `duration=1800&duration=2700`) which serde's default deserializer rejects.
struct SearchQuery {
    browse_category: Option<String>,
    fitness_discipline: Option<String>,
    instructor_id: Option<String>,
    duration: Vec<u32>,
    limit: Option<u32>,
    page: Option<u32>,
}

impl SearchQuery {
    fn from_uri(uri: &Uri) -> Self {
        let pairs: Vec<(String, String)> = uri
            .query()
            .map(|q| {
                url::form_urlencoded::parse(q.as_bytes())
                    .map(|(k, v)| (k.to_string(), v.to_string()))
                    .collect()
            })
            .unwrap_or_default();

        let mut browse_category = None;
        let mut fitness_discipline = None;
        let mut instructor_id = None;
        let mut duration = Vec::new();
        let mut limit = None;
        let mut page = None;

        for (key, val) in &pairs {
            match key.as_str() {
                "browse_category" => browse_category = Some(val.clone()),
                "fitness_discipline" => fitness_discipline = Some(val.clone()),
                "instructor_id" => instructor_id = Some(val.clone()),
                "duration" => {
                    if let Ok(d) = val.parse::<u32>() {
                        duration.push(d);
                    }
                }
                "limit" => limit = val.parse().ok(),
                "page" => page = val.parse().ok(),
                _ => {}
            }
        }

        Self { browse_category, fitness_discipline, instructor_id, duration, limit, page }
    }
}

pub async fn search_rides(
    State(state): State<AppState>,
    uri: Uri,
) -> Json<SearchResponse> {
    let query = SearchQuery::from_uri(&uri);
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
            if !query.duration.is_empty() && !query.duration.contains(&r.duration) {
                return false;
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

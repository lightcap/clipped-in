use axum::{
    extract::State,
    http::StatusCode,
    Extension, Json,
};
use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
use serde_json::{json, Value};

use crate::auth::AuthUser;
use crate::models::*;
use crate::AppState;

pub async fn handle_graphql(
    State(state): State<AppState>,
    Extension(AuthUser(user)): Extension<AuthUser>,
    Json(request): Json<GraphQLRequest>,
) -> Result<Json<GraphQLResponse>, (StatusCode, Json<Value>)> {
    let query = &request.query;

    if query.contains("ViewUserStack") {
        handle_view_stack(state, &user).await
    } else if query.contains("AddClassToStack") {
        handle_add_to_stack(state, &user, &request.variables).await
    } else if query.contains("ModifyStack") || query.contains("modifyStack") {
        handle_modify_stack(state, &user, &request.variables).await
    } else {
        Err((
            StatusCode::BAD_REQUEST,
            Json(json!({"errors": [{"message": "Unknown operation"}]})),
        ))
    }
}

fn build_stack_response(store: &crate::store::Store, user_id: &str) -> GraphQLStackResponse {
    let ride_ids = store.stacks.get(user_id).cloned().unwrap_or_default();

    let stacked_classes: Vec<GraphQLStackedClass> = ride_ids
        .iter()
        .enumerate()
        .filter_map(|(i, rid)| {
            store.rides.get(rid).map(|r| GraphQLStackedClass {
                play_order: i as u32,
                peloton_class: GraphQLPelotonClass {
                    class_id: r.id.clone(),
                    title: r.title.clone(),
                    duration: r.duration,
                    fitness_discipline: Some(GraphQLFitnessDiscipline {
                        slug: r.fitness_discipline.clone(),
                        display_name: r.fitness_discipline_display_name.clone(),
                    }),
                    instructor: r
                        .instructor
                        .as_ref()
                        .map(|i| GraphQLInstructor { name: i.name.clone() }),
                },
            })
        })
        .collect();

    let total_time: u32 = stacked_classes
        .iter()
        .map(|c| c.peloton_class.duration)
        .sum();

    GraphQLStackResponse {
        num_classes: stacked_classes.len() as u32,
        total_time,
        user_stack: Some(GraphQLUserStack {
            stacked_class_list: stacked_classes,
        }),
    }
}

/// Decode a base64-encoded Peloton class ID to extract the ride_id.
fn decode_class_id(encoded: &str) -> Option<String> {
    let bytes = BASE64.decode(encoded).ok()?;
    let json_str = String::from_utf8(bytes).ok()?;
    let parsed: Value = serde_json::from_str(&json_str).ok()?;
    parsed.get("ride_id")?.as_str().map(|s| s.to_string())
}

async fn handle_view_stack(
    state: AppState,
    user: &User,
) -> Result<Json<GraphQLResponse>, (StatusCode, Json<Value>)> {
    let store = state.read().await;
    let response = build_stack_response(&store, &user.id);

    Ok(Json(GraphQLResponse {
        data: json!({ "viewUserStack": response }),
    }))
}

async fn handle_add_to_stack(
    state: AppState,
    user: &User,
    variables: &Option<Value>,
) -> Result<Json<GraphQLResponse>, (StatusCode, Json<Value>)> {
    let encoded_class_id = variables
        .as_ref()
        .and_then(|v| v.get("input"))
        .and_then(|v| v.get("pelotonClassId"))
        .and_then(|v| v.as_str())
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                Json(json!({"errors": [{"message": "Missing input.pelotonClassId"}]})),
            )
        })?;

    let ride_id = decode_class_id(encoded_class_id).ok_or_else(|| {
        (
            StatusCode::BAD_REQUEST,
            Json(json!({"errors": [{"message": "Invalid pelotonClassId encoding"}]})),
        )
    })?;

    {
        let mut store = state.write().await;
        if !store.rides.contains_key(&ride_id) {
            return Err((
                StatusCode::BAD_REQUEST,
                Json(json!({"errors": [{"message": "Class not found"}]})),
            ));
        }
        let stack = store.stacks.entry(user.id.clone()).or_default();
        if !stack.contains(&ride_id) {
            stack.push(ride_id);
        }
    }

    let store = state.read().await;
    let response = build_stack_response(&store, &user.id);

    Ok(Json(GraphQLResponse {
        data: json!({ "addClassToStack": response }),
    }))
}

async fn handle_modify_stack(
    state: AppState,
    user: &User,
    variables: &Option<Value>,
) -> Result<Json<GraphQLResponse>, (StatusCode, Json<Value>)> {
    let encoded_ids = variables
        .as_ref()
        .and_then(|v| v.get("input"))
        .and_then(|v| v.get("pelotonClassIdList"))
        .and_then(|v| v.as_array())
        .ok_or_else(|| {
            (
                StatusCode::BAD_REQUEST,
                Json(json!({"errors": [{"message": "Missing input.pelotonClassIdList"}]})),
            )
        })?;

    let ride_ids: Vec<String> = encoded_ids
        .iter()
        .filter_map(|v| v.as_str())
        .filter_map(|encoded| decode_class_id(encoded))
        .collect();

    {
        let mut store = state.write().await;
        store.stacks.insert(user.id.clone(), ride_ids);
    }

    let store = state.read().await;
    let response = build_stack_response(&store, &user.id);

    Ok(Json(GraphQLResponse {
        data: json!({ "modifyStack": response }),
    }))
}

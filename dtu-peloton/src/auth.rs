use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::{IntoResponse, Response},
    Json,
};
use serde_json::json;

use crate::AppState;
use crate::models::User;

/// Extension type to carry the authenticated user through request handlers.
#[derive(Clone)]
pub struct AuthUser(pub User);

pub async fn auth_middleware(
    State(state): State<AppState>,
    mut request: Request<Body>,
    next: Next,
) -> Response {
    let auth_header = request
        .headers()
        .get("authorization")
        .and_then(|v| v.to_str().ok());

    let token = match auth_header {
        Some(h) if h.starts_with("Bearer ") => &h[7..],
        _ => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({"error": "Missing or invalid Authorization header"})),
            )
                .into_response();
        }
    };

    let store = state.read().await;
    let user_id = match store.tokens.get(token) {
        Some(id) => id.clone(),
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({"error": "Invalid token"})),
            )
                .into_response();
        }
    };

    let user = match store.users.get(&user_id) {
        Some(u) => u.clone(),
        None => {
            return (
                StatusCode::UNAUTHORIZED,
                Json(json!({"error": "User not found for token"})),
            )
                .into_response();
        }
    };

    // Drop the read lock before proceeding
    drop(store);

    request.extensions_mut().insert(AuthUser(user));
    next.run(request).await
}

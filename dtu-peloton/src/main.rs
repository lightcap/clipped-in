mod auth;
mod handlers;
mod models;
mod store;

use axum::{Router, middleware};
use std::sync::Arc;
use tokio::sync::RwLock;
use tower_http::cors::CorsLayer;

use store::Store;

pub type AppState = Arc<RwLock<Store>>;

#[tokio::main]
async fn main() {
    let port = std::env::var("PORT").unwrap_or_else(|_| "4201".to_string());
    let state = Arc::new(RwLock::new(Store::new()));

    let app = Router::new()
        .merge(handlers::routes())
        .layer(middleware::from_fn_with_state(state.clone(), auth::auth_middleware))
        .layer(CorsLayer::permissive())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}"))
        .await
        .expect("Failed to bind");

    println!("dtu-peloton listening on :{port}");

    axum::serve(listener, app).await.expect("Server error");
}

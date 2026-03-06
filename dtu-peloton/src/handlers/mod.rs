pub mod graphql;
pub mod me;
pub mod search;
pub mod stack;
pub mod workout;
pub mod workouts;

use axum::{Router, routing::{get, post, delete}};
use crate::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        // User profile
        .route("/api/me", get(me::get_me))
        // Workouts
        .route("/api/workout/{id}", get(workout::get_workout))
        .route("/api/workout/{id}/performance_graph", get(workout::get_performance_graph))
        // User workout list
        .route("/api/user/{user_id}/workouts", get(workouts::get_user_workouts))
        // Class search
        .route("/api/v2/ride/archived", get(search::search_rides))
        // Stack (REST)
        .route("/api/user/{user_id}/stack", get(stack::get_stack))
        .route("/api/user/{user_id}/stack", post(stack::add_to_stack))
        .route("/api/user/{user_id}/stack/{class_id}", delete(stack::remove_from_stack))
        // GraphQL
        .route("/graphql", post(graphql::handle_graphql))
}

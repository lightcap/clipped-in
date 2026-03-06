use axum::{Extension, Json};

use crate::auth::AuthUser;
use crate::models::User;

pub async fn get_me(Extension(AuthUser(user)): Extension<AuthUser>) -> Json<User> {
    Json(user)
}

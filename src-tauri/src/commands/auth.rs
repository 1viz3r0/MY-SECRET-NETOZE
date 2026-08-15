// NET0ZE auth commands — the only entry points the frontend can call.
// Every request is validated back-end side: session token, role, input shape.
// A compromised frontend cannot forge a session or escalate roles.

use crate::services::auth_service::{self, ActivityEntry, AuthSession, PublicUser};
use tauri::command;

#[command]
pub fn auth_register(
    name: String,
    email: String,
    password: String,
) -> Result<AuthSession, String> {
    auth_service::register(&name, &email, &password)
}

#[command]
pub fn auth_login(email: String, password: String) -> Result<AuthSession, String> {
    auth_service::login(&email, &password)
}

#[command]
pub fn auth_logout(token: String) -> Result<(), String> {
    auth_service::logout(&token)
}

#[command]
pub fn auth_session(token: String) -> Result<Option<PublicUser>, String> {
    auth_service::session_user(&token)
}

#[command]
pub fn auth_my_activity(token: String, limit: Option<usize>) -> Result<Vec<ActivityEntry>, String> {
    auth_service::my_activity(&token, limit.unwrap_or(50))
}

#[command]
pub fn admin_list_users(token: String) -> Result<Vec<PublicUser>, String> {
    auth_service::admin_list_users(&token)
}

#[command]
pub fn admin_list_activity(
    token: String,
    limit: Option<usize>,
) -> Result<Vec<ActivityEntry>, String> {
    auth_service::admin_list_activity(&token, limit.unwrap_or(100))
}
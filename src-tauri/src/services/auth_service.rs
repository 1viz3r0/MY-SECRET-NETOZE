// NET0ZE local authentication service.
//
// Design (per product pass constraints):
// - Real backend auth, NOT frontend-only. Every command validates the session
//   token and the user role inside the Rust backend.
// - Passwords are hashed with PBKDF2-HMAC-SHA256 (built on the existing `sha2`
//   dependency; no new crates). Each user gets a unique 16-byte random salt.
// - Credentials/sessions/activity are persisted in `netoze_auth.json` inside the
//   app data directory (no SQLite schema changes).
// - The first registered account becomes ADMIN; all later accounts are NORMAL
//   USER. Role updates are only possible by editing the local store file — a
//   frontend manipulator cannot escalate.
// - Login rate limiting: 5 consecutive failures locks the account for 15 minutes.
// - Session tokens: 32 random bytes, stored only as SHA-256 hashes, 8h TTL.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const AUTH_FILE: &str = "netoze_auth.json";
const SALT_BYTES: usize = 16;
const TOKEN_BYTES: usize = 32;
const PBKDF2_ITERATIONS: u32 = 120_000;
const MAX_FAILED_ATTEMPTS: i64 = 5;
const LOCKOUT_SECS: i64 = 900;
const SESSION_TTL_SECS: i64 = 8 * 60 * 60;
const MAX_ACTIVITY_ENTRIES: usize = 1000;

static AUTH_LOCK: Mutex<()> = Mutex::new(());

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredUser {
    pub id: String,
    pub name: String,
    pub email: String,
    pub role: String,
    pub salt: String,
    pub hash: String,
    pub iterations: u32,
    pub status: String,
    pub locked_until: i64,
    pub failed_attempts: i64,
    pub created_at: i64,
    pub last_login_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StoredSession {
    pub user_id: String,
    pub created_at: i64,
    pub expires_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActivityEntry {
    pub id: i64,
    pub timestamp: i64,
    pub actor_email: String,
    pub action: String,
    pub detail: String,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct AuthStore {
    pub version: u32,
    pub users: HashMap<String, StoredUser>,
    pub sessions: HashMap<String, StoredSession>,
    pub activity: Vec<ActivityEntry>,
    pub next_activity_id: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PublicUser {
    pub id: String,
    pub name: String,
    pub email: String,
    pub role: String,
    pub status: String,
    pub created_at: i64,
    pub last_login_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthSession {
    pub user: PublicUser,
    pub token: String,
}

fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0)
}

// OS-seeded entropy via std RandomState hasher keys (no new crates).
fn entropy_bytes(n: usize) -> Vec<u8> {
    use std::collections::hash_map::RandomState;
    use std::hash::{BuildHasher, Hash, Hasher};
    let rs = RandomState::new();
    let mut out: Vec<u8> = Vec::with_capacity(n);
    let mut counter = 0u64;
    while out.len() < n {
        let mut h = rs.build_hasher();
        counter.hash(&mut h);
        now_secs().hash(&mut h);
        std::process::id().hash(&mut h);
        out.extend_from_slice(&h.finish().to_be_bytes());
        counter = counter.wrapping_add(1);
    }
    out.truncate(n);
    out
}

fn to_hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

fn sha256_hex(data: &[u8]) -> String {
    to_hex(&Sha256::digest(data))
}

fn hmac_sha256(key: &[u8], data: &[u8]) -> [u8; 32] {
    const BLOCK: usize = 64;
    let mut k = [0u8; BLOCK];
    if key.len() > BLOCK {
        let d = Sha256::digest(key);
        k[..32].copy_from_slice(&d);
    } else {
        k[..key.len()].copy_from_slice(key);
    }
    let mut ipad = [0x36u8; BLOCK];
    let mut opad = [0x5cu8; BLOCK];
    for i in 0..BLOCK {
        ipad[i] ^= k[i];
        opad[i] ^= k[i];
    }
    let mut inner = Sha256::new();
    inner.update(ipad);
    inner.update(data);
    let inner_digest = inner.finalize();
    let mut outer = Sha256::new();
    outer.update(opad);
    outer.update(inner_digest);
    let out = outer.finalize();
    let mut result = [0u8; 32];
    result.copy_from_slice(&out);
    result
}

fn pbkdf2_sha256(password: &[u8], salt: &[u8], iterations: u32) -> [u8; 32] {
    let mut block: Vec<u8> = Vec::with_capacity(salt.len() + 4);
    block.extend_from_slice(salt);
    block.extend_from_slice(&1u32.to_be_bytes());
    let mut u = hmac_sha256(password, &block);
    let mut t = u;
    for _ in 1..iterations {
        u = hmac_sha256(password, &u);
        for i in 0..32 {
            t[i] ^= u[i];
        }
    }
    t
}

fn auth_path() -> PathBuf {
    let mut p = crate::database::sqlite::get_app_dir();
    p.push(AUTH_FILE);
    p
}

fn load_store() -> Result<AuthStore, String> {
    let path = auth_path();
    if !path.exists() {
        return Ok(AuthStore {
            version: 1,
            users: HashMap::new(),
            sessions: HashMap::new(),
            activity: Vec::new(),
            next_activity_id: 1,
        });
    }
    let data = std::fs::read_to_string(&path).map_err(|e| format!("auth store read: {e}"))?;
    serde_json::from_str(&data).map_err(|e| format!("auth store parse: {e}"))
}

fn save_store(store: &AuthStore) -> Result<(), String> {
    let path = auth_path();
    let data = serde_json::to_string_pretty(store).map_err(|e| e.to_string())?;
    std::fs::write(&path, data).map_err(|e| format!("auth store write: {e}"))
}

fn prune_expired_sessions(store: &mut AuthStore) {
    let now = now_secs();
    store.sessions.retain(|_, s| s.expires_at > now);
}

fn push_activity(store: &mut AuthStore, actor_email: &str, action: &str, detail: &str) {
    let id = store.next_activity_id;
    store.next_activity_id = id + 1;
    store.activity.push(ActivityEntry {
        id,
        timestamp: now_secs(),
        actor_email: actor_email.to_string(),
        action: action.to_string(),
        detail: detail.to_string(),
    });
    if store.activity.len() > MAX_ACTIVITY_ENTRIES {
        let excess = store.activity.len() - MAX_ACTIVITY_ENTRIES;
        store.activity.drain(0..excess);
    }
}

fn to_public(user: &StoredUser) -> PublicUser {
    PublicUser {
        id: user.id.clone(),
        name: user.name.clone(),
        email: user.email.clone(),
        role: user.role.clone(),
        status: user.status.clone(),
        created_at: user.created_at,
        last_login_at: user.last_login_at,
    }
}

fn current_status(user: &StoredUser) -> String {
    if user.status == "locked" && user.locked_until > now_secs() {
        "locked".to_string()
    } else {
        "active".to_string()
    }
}

fn normalize_email(raw: &str) -> String {
    raw.trim().to_lowercase()
}

fn valid_email(email: &str) -> bool {
    let e = email.trim();
    let at = e.find('@');
    match at {
        Some(i) => {
            i > 0
                && i + 1 < e.len()
                && e[i + 1..].contains('.')
                && e.len() <= 254
                && !e.contains(' ')
        }
        None => false,
    }
}

fn valid_name(name: &str) -> bool {
    let n = name.trim();
    (2..=64).contains(&n.len())
        && n
            .chars()
            .all(|c| c.is_alphanumeric() || c == ' ' || c == '-' || c == '_' || c == '.')
}

fn valid_password(pw: &str) -> bool {
    (8..=128).contains(&pw.len())
}

fn mirror_user_profile(user: &StoredUser) {
    let path = crate::database::sqlite::get_app_dir().join("netoze_app.db");
    let Ok(conn) = rusqlite::Connection::open(&path) else {
        return;
    };
    let _ = conn.execute(
        "INSERT OR IGNORE INTO user_profiles (id, name, email, role, created_at) \
         VALUES (?1, ?2, ?3, ?4, CURRENT_TIMESTAMP)",
        rusqlite::params![user.id, user.name, user.email, user.role],
    );
}

pub fn register(name: &str, email: &str, password: &str) -> Result<AuthSession, String> {
    let name = name.trim();
    let email = normalize_email(email);
    if !valid_name(name) {
        return Err("NAME_INVALID".to_string());
    }
    if !valid_email(&email) {
        return Err("EMAIL_INVALID".to_string());
    }
    if !valid_password(password) {
        return Err("PASSWORD_INVALID_MIN_8_MAX_128".to_string());
    }

    let _lock = AUTH_LOCK.lock().map_err(|_| "AUTH_LOCK_POISONED".to_string())?;
    let mut store = load_store()?;
    prune_expired_sessions(&mut store);

    if store.users.contains_key(&email) {
        return Err("EMAIL_ALREADY_REGISTERED".to_string());
    }

    let role = if store.users.is_empty() {
        "admin".to_string()
    } else {
        "user".to_string()
    };

    let salt = to_hex(&entropy_bytes(SALT_BYTES));
    let salt_bytes: Vec<u8> = salt
        .as_bytes()
        .chunks(2)
        .filter_map(|c| std::str::from_utf8(c).ok().and_then(|s| u8::from_str_radix(s, 16).ok()))
        .collect();
    let hash = to_hex(&pbkdf2_sha256(password.as_bytes(), &salt_bytes, PBKDF2_ITERATIONS));

    let user = StoredUser {
        id: to_hex(&entropy_bytes(16)),
        name: name.to_string(),
        email: email.clone(),
        role: role.clone(),
        salt: salt.clone(),
        hash,
        iterations: PBKDF2_ITERATIONS,
        status: "active".to_string(),
        locked_until: 0,
        failed_attempts: 0,
        created_at: now_secs(),
        last_login_at: None,
    };

    store.users.insert(email.clone(), user.clone());
    push_activity(&mut store, &email, "REGISTER", &format!("role={}", user.role));
    mirror_user_profile(&user);

    let token = to_hex(&entropy_bytes(TOKEN_BYTES));
    let key = sha256_hex(token.as_bytes());
    let now = now_secs();
    store.sessions.insert(
        key,
        StoredSession {
            user_id: user.id.clone(),
            created_at: now,
            expires_at: now + SESSION_TTL_SECS,
        },
    );
    push_activity(&mut store, &email, "LOGIN", "registered_user_auto_login");
    save_store(&store)?;

    Ok(AuthSession {
        user: to_public(&user),
        token,
    })
}

pub fn login(email: &str, password: &str) -> Result<AuthSession, String> {
    let email = normalize_email(email);
    if email.is_empty() || password.is_empty() {
        return Err("EMPTY_CREDENTIALS".to_string());
    }

    let _lock = AUTH_LOCK.lock().map_err(|_| "AUTH_LOCK_POISONED".to_string())?;
    let mut store = load_store()?;
    prune_expired_sessions(&mut store);

    let Some(user) = store.users.get_mut(&email).cloned() else {
        push_activity(&mut store, &email, "LOGIN_FAILED", "unknown_email");
        let _ = save_store(&store);
        return Err("INVALID_CREDENTIALS".to_string());
    };

    if current_status(&user) == "locked" {
        return Err("ACCOUNT_LOCKED_TRY_LATER".to_string());
    }

    let salt_bytes: Vec<u8> = user
        .salt
        .as_bytes()
        .chunks(2)
        .filter_map(|c| std::str::from_utf8(c).ok().and_then(|s| u8::from_str_radix(s, 16).ok()))
        .collect();
    let candidate = to_hex(&pbkdf2_sha256(
        password.as_bytes(),
        &salt_bytes,
        user.iterations,
    ));

    if candidate != user.hash {
        let mut locked = false;
        if let Some(u) = store.users.get_mut(&email) {
            u.failed_attempts += 1;
            if u.failed_attempts >= MAX_FAILED_ATTEMPTS {
                u.status = "locked".to_string();
                u.locked_until = now_secs() + LOCKOUT_SECS;
                locked = true;
            }
        }
        push_activity(
            &mut store,
            &email,
            "LOGIN_FAILED",
            if locked { "account_locked" } else { "wrong_password" },
        );
        let _ = save_store(&store);
        if locked {
            return Err("ACCOUNT_LOCKED_TRY_LATER".to_string());
        }
        return Err("INVALID_CREDENTIALS".to_string());
    }

    if let Some(u) = store.users.get_mut(&email) {
        u.failed_attempts = 0;
        u.status = "active".to_string();
        u.locked_until = 0;
        u.last_login_at = Some(now_secs());
    }

    let token = to_hex(&entropy_bytes(TOKEN_BYTES));
    let key = sha256_hex(token.as_bytes());
    let now = now_secs();
    store.sessions.insert(
        key,
        StoredSession {
            user_id: user.id.clone(),
            created_at: now,
            expires_at: now + SESSION_TTL_SECS,
        },
    );
    push_activity(&mut store, &email, "LOGIN", "password_login");
    save_store(&store)?;

    let mut pub_user = to_public(&user);
    pub_user.status = "active".to_string();
    pub_user.last_login_at = Some(now);
    Ok(AuthSession {
        user: pub_user,
        token,
    })
}

pub fn logout(token: &str) -> Result<(), String> {
    let _lock = AUTH_LOCK.lock().map_err(|_| "AUTH_LOCK_POISONED".to_string())?;
    let mut store = load_store()?;
    let key = sha256_hex(token.as_bytes());
    if let Some(sess) = store.sessions.remove(&key) {
        if let Some(user) = store.users.values().find(|u| u.id == sess.user_id) {
            let email = user.email.clone();
            push_activity(&mut store, &email, "LOGOUT", "session_closed");
        }
        let _ = save_store(&store);
    }
    Ok(())
}

pub fn session_user(token: &str) -> Result<Option<PublicUser>, String> {
    let _lock = AUTH_LOCK.lock().map_err(|_| "AUTH_LOCK_POISONED".to_string())?;
    let mut store = load_store()?;
    prune_expired_sessions(&mut store);
    let key = sha256_hex(token.as_bytes());
    let Some(sess) = store.sessions.get(&key) else {
        return Ok(None);
    };
    if sess.expires_at <= now_secs() {
        store.sessions.remove(&key);
        let _ = save_store(&store);
        return Ok(None);
    }
    let user = store.users.values().find(|u| u.id == sess.user_id).cloned();
    let Some(user) = user else {
        return Ok(None);
    };
    let status = current_status(&user);
    if status == "locked" {
        store.sessions.remove(&key);
        let _ = save_store(&store);
        return Ok(None);
    }
    let mut pub_user = to_public(&user);
    pub_user.status = status;
    Ok(Some(pub_user))
}

pub fn require_user(token: &str) -> Result<PublicUser, String> {
    session_user(token)?.ok_or_else(|| "AUTH_REQUIRED_SESSION_INVALID_OR_EXPIRED".to_string())
}

pub fn require_admin(token: &str) -> Result<PublicUser, String> {
    let user = require_user(token)?;
    if user.role != "admin" {
        return Err("FORBIDDEN_ADMIN_ROLE_REQUIRED".to_string());
    }
    Ok(user)
}

pub fn my_activity(token: &str, limit: usize) -> Result<Vec<ActivityEntry>, String> {
    let user = require_user(token)?;
    let _lock = AUTH_LOCK.lock().map_err(|_| "AUTH_LOCK_POISONED".to_string())?;
    let store = load_store()?;
    let mut mine: Vec<ActivityEntry> = store
        .activity
        .iter()
        .filter(|a| a.actor_email == user.email)
        .cloned()
        .collect();
    mine.sort_by(|a, b| b.timestamp.cmp(&a.timestamp).then(b.id.cmp(&a.id)));
    mine.truncate(limit.min(200));
    Ok(mine)
}

pub fn admin_list_users(token: &str) -> Result<Vec<PublicUser>, String> {
    require_admin(token)?;
    let _lock = AUTH_LOCK.lock().map_err(|_| "AUTH_LOCK_POISONED".to_string())?;
    let store = load_store()?;
    let mut users: Vec<PublicUser> = store
        .users
        .values()
        .map(|u| {
            let mut p = to_public(u);
            p.status = current_status(u);
            p
        })
        .collect();
    users.sort_by(|a, b| a.created_at.cmp(&b.created_at));
    Ok(users)
}

pub fn admin_list_activity(token: &str, limit: usize) -> Result<Vec<ActivityEntry>, String> {
    require_admin(token)?;
    let _lock = AUTH_LOCK.lock().map_err(|_| "AUTH_LOCK_POISONED".to_string())?;
    let store = load_store()?;
    let mut items = store.activity.clone();
    items.sort_by(|a, b| b.timestamp.cmp(&a.timestamp).then(b.id.cmp(&a.id)));
    items.truncate(limit.min(500));
    Ok(items)
}
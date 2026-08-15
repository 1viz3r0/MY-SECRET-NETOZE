//! Verification of NET0ZE auth flows A–J at the backend enforcement layer.
//! The UI (WebView2) cannot be driven without CDP (prohibited), so the
//! backend commands/logic — which is where sessions and roles are actually
//! enforced — is what flows A–J exercise here.
//!
//! The test is self-cleaning: it removes netoze_auth.json after the run and
//! deletes the two test rows mirrored into user_profiles.

use netoze_desktop::services::auth_service as auth;

const P1: &str = "S3cretP@ssw0rd1";
const P2: &str = "S3cretP@ssw0rd2";

fn cleanup_store_artifacts() {
    let mut p = netoze_desktop::database::sqlite::get_app_dir();
    p.push("netoze_auth.json");
    let _ = std::fs::remove_file(&p);
    if let Ok(conn) = netoze_desktop::database::sqlite::open_conn() {
        let _ = conn.execute(
            "DELETE FROM user_profiles WHERE email IN ('alice@netoze.test','bob@netoze.test')",
            (),
        );
    }
}

#[test]
fn verify_auth_flows_a_through_j() {
    cleanup_store_artifacts();

    // A + B: registering the FIRST account makes it ADMIN
    let alice = auth::register("Alice Admin", "alice@netoze.test", P1).expect("A: register");
    assert_eq!(alice.user.role, "admin", "B: first account must be admin");
    assert_eq!(alice.user.status, "active");

    // C + J: logout invalidates the session token
    auth::logout(&alice.token).expect("C: logout");
    assert!(
        auth::session_user(&alice.token)
            .expect("J: session check")
            .is_none(),
        "J: logged-out token must not restore a session"
    );

    // D: login again with valid credentials
    let alice2 = auth::login("alice@netoze.test", P1).expect("D: login");
    assert_eq!(alice2.user.role, "admin");

    // E + F: SECOND account becomes a normal USER
    let bob = auth::register("Bob User", "bob@netoze.test", P2).expect("E: register");
    assert_eq!(bob.user.role, "user", "F: second account must be a user");

    // G: USER cannot reach the admin APIs (backend-enforced)
    let err = auth::admin_list_users(&bob.token).expect_err("G: users must be forbidden");
    assert_eq!(err, "FORBIDDEN_ADMIN_ROLE_REQUIRED");
    auth::admin_list_activity(&bob.token, 10)
        .expect_err("G: activity must be forbidden");

    // H: ADMIN sees the full user directory with correct roles
    let users = auth::admin_list_users(&alice2.token).expect("H: admin list");
    assert_eq!(users.len(), 2, "H: directory contains both accounts");
    assert!(
        users
            .iter()
            .any(|u| u.role == "admin" && u.email == "alice@netoze.test")
    );
    assert!(users.iter().any(|u| u.role == "user" && u.email == "bob@netoze.test"));

    // I: ADMIN sees the activity trail with actors
    let acts = auth::admin_list_activity(&alice2.token, 100).expect("I: activity");
    assert!(
        acts.iter()
            .any(|a| a.action == "REGISTER" && a.actor_email == "alice@netoze.test")
    );
    assert!(
        acts.iter()
            .any(|a| a.action == "LOGOUT" && a.actor_email == "alice@netoze.test")
    );
    assert!(
        acts.iter()
            .any(|a| a.action == "LOGIN" && a.actor_email == "bob@netoze.test")
    );

    // own-activity is scoped to the requesting user only
    let mine = auth::my_activity(&alice2.token, 20).expect("my activity");
    assert!(
        mine.iter().all(|a| a.actor_email == "alice@netoze.test"),
        "per-user activity must be scoped"
    );

    // security control: 5 failed logins lock the account
    for _ in 0..5 {
        let _ = auth::login("bob@netoze.test", "wrong-password-1");
    }
    let locked = auth::login("bob@netoze.test", P2).expect_err("lockout");
    assert_eq!(locked, "ACCOUNT_LOCKED_TRY_LATER");

    cleanup_store_artifacts();
}
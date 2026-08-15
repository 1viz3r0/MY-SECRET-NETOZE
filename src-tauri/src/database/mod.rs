pub mod duckdb;
pub mod forensic_db;
pub mod sqlite;

pub use duckdb::init_duckdb;
pub use forensic_db::execute_forensic_query;
pub use sqlite::{get_app_dir, init_sqlite};

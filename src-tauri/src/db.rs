// Compatibility shim: re-exports database helpers under the `db` namespace
// that older command code references.
pub use crate::database::sqlite::open_conn as get_connection;
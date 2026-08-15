pub mod event_log;
pub mod tcp_table;
pub mod windows;

pub use event_log::get_windows_event_logs;
pub use tcp_table::get_active_tcp_connections;
pub use windows::{
    get_capabilities, get_detailed_network_adapters, get_detailed_system_information,
    get_network_adapters, get_system_information,
};

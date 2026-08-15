use crate::models::TcpConnectionEntry;
use std::collections::HashMap;
use sysinfo::System;

#[cfg(windows)]
use windows_sys::Win32::NetworkManagement::IpHelper::{
    GetExtendedTcpTable, MIB_TCPTABLE_OWNER_PID, MIB_TCPROW_OWNER_PID,
    TCP_TABLE_OWNER_PID_ALL,
};

#[cfg(windows)]
const AF_INET: u32 = 2;

/// Maps Windows TCP State integer to human-readable TCP State string
pub fn map_tcp_state(state: u32) -> String {
    match state {
        1 => "CLOSED".to_string(),
        2 => "LISTEN".to_string(),
        3 => "SYN_SENT".to_string(),
        4 => "SYN_RECEIVED".to_string(),
        5 => "ESTABLISHED".to_string(),
        6 => "FIN_WAIT1".to_string(),
        7 => "FIN_WAIT2".to_string(),
        8 => "CLOSE_WAIT".to_string(),
        9 => "CLOSING".to_string(),
        10 => "LAST_ACK".to_string(),
        11 => "TIME_WAIT".to_string(),
        12 => "DELETE_TCB".to_string(),
        _ => format!("UNKNOWN ({})", state),
    }
}

/// Converts IPv4 DWORD to standard dot-decimal string
fn dword_to_ip(dw: u32) -> String {
    let bytes = dw.to_ne_bytes();
    format!("{}.{}.{}.{}", bytes[0], bytes[1], bytes[2], bytes[3])
}

/// Converts network byte order DWORD port to host u16
fn dword_to_port(dw: u32) -> u16 {
    u16::from_be(dw as u16)
}

/// Fetches active TCP connections from Windows network stack using GetExtendedTcpTable
pub fn get_active_tcp_connections() -> Vec<TcpConnectionEntry> {
    let mut entries = Vec::new();

    // Refresh process snapshot for PID mapping
    let mut sys = System::new_all();
    sys.refresh_all();

    let process_map: HashMap<u32, String> = sys
        .processes()
        .iter()
        .map(|(pid, proc_info)| (pid.as_u32(), proc_info.name().to_string()))
        .collect();

    #[cfg(windows)]
    unsafe {
        let mut size: u32 = 0;
        // First call to determine buffer size
        GetExtendedTcpTable(
            std::ptr::null_mut(),
            &mut size,
            0,
            AF_INET,
            TCP_TABLE_OWNER_PID_ALL,
            0,
        );

        if size > 0 {
            let mut buf: Vec<u8> = vec![0; size as usize];
            let res = GetExtendedTcpTable(
                buf.as_mut_ptr() as *mut _,
                &mut size,
                0,
                AF_INET,
                TCP_TABLE_OWNER_PID_ALL,
                0,
            );

            if res == 0 {
                let table_ptr = buf.as_ptr() as *const MIB_TCPTABLE_OWNER_PID;
                let num_entries = (*table_ptr).dwNumEntries as usize;
                let rows_ptr = std::ptr::addr_of!((*table_ptr).table) as *const MIB_TCPROW_OWNER_PID;

                for i in 0..num_entries {
                    let row = *rows_ptr.add(i);
                    let local_ip = dword_to_ip(row.dwLocalAddr);
                    let local_port = dword_to_port(row.dwLocalPort);
                    let remote_ip = dword_to_ip(row.dwRemoteAddr);
                    let remote_port = dword_to_port(row.dwRemotePort);
                    let tcp_state = map_tcp_state(row.dwState);
                    let pid = row.dwOwningPid;

                    let process_name = process_map
                        .get(&pid)
                        .cloned()
                        .unwrap_or_else(|| "Unknown".to_string());

                    entries.push(TcpConnectionEntry {
                        local_ip,
                        local_port,
                        remote_ip,
                        remote_port,
                        tcp_state,
                        pid,
                        process_name,
                    });
                }
            }
        }
    }

    entries
}

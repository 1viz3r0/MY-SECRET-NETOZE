use crate::models::WindowsEventEntry;
use windows_sys::Win32::Foundation::{ERROR_INSUFFICIENT_BUFFER, ERROR_NO_MORE_ITEMS, GetLastError};
use windows_sys::Win32::System::EventLog::{
    EvtClose, EvtNext, EvtQuery, EvtRender, EvtQueryChannelPath, EvtQueryReverseDirection,
    EvtRenderEventXml,
};

const EVT_HANDLE_NULL: isize = 0;

fn wide(s: &str) -> Vec<u16> {
    s.encode_utf16().chain(std::iter::once(0)).collect()
}

/// Reads a substring between `<tag>` and `</tag>` (no nesting) from an XML fragment.
fn extract_tag(xml: &str, tag: &str) -> Option<String> {
    let open = format!("<{}>", tag);
    let close = format!("</{}>", tag);
    let start = xml.find(&open)? + open.len();
    let end = xml[start..].find(&close)? + start;
    let val = xml[start..end].trim();
    if val.is_empty() { None } else { Some(val.to_string()) }
}

/// Reads the `name="..."` attribute of `<tag ...>`.
fn extract_attr(xml: &str, tag: &str, attr: &str) -> Option<String> {
    let open = format!("<{}", tag);
    let idx = xml.find(&open)?;
    let rest = &xml[idx + open.len()..];
    let end = rest.find(['>', ' '])?;
    let after = &rest[end..];
    let pat = format!("{}=\"", attr);
    let attr_idx = after.find(&pat)? + pat.len();
    let close_idx = after[attr_idx..].find('"')? + attr_idx;
    let val = &after[attr_idx..close_idx];
    if val.is_empty() { None } else { Some(val.to_string()) }
}

fn level_name(level: u32) -> String {
    match level {
        1 => "CRITICAL".to_string(),
        2 => "ERROR".to_string(),
        3 => "WARNING".to_string(),
        4 => "INFO".to_string(),
        5 => "VERBOSE".to_string(),
        _ => "INFO".to_string(),
    }
}

fn level_from_xml(xml: &str) -> u32 {
    extract_tag(xml, "Level")
        .and_then(|v| v.parse::<u32>().ok())
        .unwrap_or(4)
}

fn message_from_xml(xml: &str) -> String {
    let mut parts = Vec::new();
    let mut rest = xml;
    while let Some(start) = rest.find("<Data>") {
        let start = start + 6;
        let Some(end) = rest[start..].find("</Data>") else {
            break;
        };
        let value = rest[start..start + end].trim();
        if !value.is_empty() {
            parts.push(value.to_string());
        }
        rest = &rest[start + end + 7..];
    }
    let joined = parts.join(" | ");
    if joined.is_empty() {
        "No event data rendered (run elevated for full event content)".to_string()
    } else if joined.len() > 500 {
        joined[..500].to_string()
    } else {
        joined
    }
}

/// Queries real Windows Event Log (System + Security, last 7 days) via EvtQuery.
/// Returns an empty vec on any failure — never fabricates events.
pub fn get_windows_event_logs(limit: usize) -> Vec<WindowsEventEntry> {
    const QUERY_XML: &str = r#"<QueryList>
  <Query Id="0" Path="System">
    <Select Path="System">*[System[(EventID &gt;= 1) and TimeCreated[timediff(@SystemTime) &lt;= 604800000]]]</Select>
  </Query>
  <Query Id="1" Path="Security">
    <Select Path="Security">*[System[TimeCreated[timediff(@SystemTime) &lt;= 604800000]]]</Select>
  </Query>
</QueryList>"#;

    let mut entries: Vec<WindowsEventEntry> = Vec::new();
    let query_wide = wide(QUERY_XML);

    unsafe {
        let query_handle = EvtQuery(
            EVT_HANDLE_NULL,
            std::ptr::null(),
            query_wide.as_ptr(),
            EvtQueryChannelPath | EvtQueryReverseDirection,
        );
        if query_handle == EVT_HANDLE_NULL {
            tracing::warn!(
                "⚠️ EvtQuery failed (last_error={}). Check channel permissions.",
                GetLastError()
            );
            return entries;
        }

        let batch = 8u32;
        let mut buffer: Vec<u16> = Vec::with_capacity(16 * 1024);
        let mut num_returned: u32 = 0;
        let mut rounds = 0;
        let max_rounds = (limit as u32 / batch + 3).max(3);

        loop {
            if entries.len() >= limit || rounds >= max_rounds {
                break;
            }
            rounds += 1;

            let mut handles = [EVT_HANDLE_NULL; 8];
            num_returned = 0;
            let ok = EvtNext(
                query_handle,
                batch,
                handles.as_mut_ptr(),
                150,
                0,
                &mut num_returned,
            );

            if ok == 0 {
                let err = GetLastError();
                if err == ERROR_NO_MORE_ITEMS {
                    break;
                }
                tracing::debug!("EvtNext stopped: last_error={}", err);
                break;
            }

            for i in 0..num_returned as usize {
                let event_handle = handles[i];
                if event_handle == EVT_HANDLE_NULL {
                    continue;
                }

                // EvtRender with growable buffer
                let mut buffer_used: u32 = 0;
                let mut property_count: u32 = 0;
                buffer.clear();
                let mut ok_render = EvtRender(
                    EVT_HANDLE_NULL,
                    event_handle,
                    EvtRenderEventXml,
                    0,
                    std::ptr::null_mut(),
                    &mut buffer_used,
                    &mut property_count,
                );
                if ok_render == 0 && GetLastError() == ERROR_INSUFFICIENT_BUFFER && buffer_used > 0 {
                    buffer.resize(buffer_used as usize, 0);
                    ok_render = EvtRender(
                        EVT_HANDLE_NULL,
                        event_handle,
                        EvtRenderEventXml,
                        buffer_used,
                        buffer.as_mut_ptr() as *mut _,
                        &mut buffer_used,
                        &mut property_count,
                    );
                }

                if ok_render != 0 {
                    let len = buffer.iter().position(|&u| u == 0).unwrap_or(buffer.len());
                    let xml = String::from_utf16_lossy(&buffer[..len]);
                    let timestamp = extract_attr(&xml, "TimeCreated", "SystemTime")
                        .map(|t| {
                            chrono::DateTime::parse_from_rfc3339(&t)
                                .map(|dt| dt.to_rfc3339())
                                .unwrap_or(t)
                        })
                        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
                    let provider = extract_attr(&xml, "Provider", "Name")
                        .unwrap_or_else(|| "Microsoft-Windows".to_string());
                    let event_id = extract_tag(&xml, "EventID")
                        .and_then(|v| v.parse::<u32>().ok())
                        .unwrap_or(0);
                    let channel = extract_tag(&xml, "Channel").unwrap_or_default();
                    let level = level_name(level_from_xml(&xml));
                    let message = message_from_xml(&xml);

                    entries.push(WindowsEventEntry {
                        timestamp,
                        provider,
                        event_id,
                        level,
                        message,
                        channel,
                    });
                }
                EvtClose(event_handle);
            }

            if entries.len() >= limit {
                break;
            }
        }
        EvtClose(query_handle);
    }

    entries.truncate(limit);
    entries
}

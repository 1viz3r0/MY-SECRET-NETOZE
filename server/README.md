# server/ — RETIRED

The Express + mongoose demo backend previously served fabricated data on
`http://127.0.0.1:5000` (flows, events, graph, auth, IOCs, audit log, admin users,
hybrid engine, education labs, rules replay).

It was removed in the Phase 11 rewrite. The desktop build is fully standalone:

- All telemetry, detections, graphs, GeoIP, threat feeds, device/port discovery,
  DNS, audit log and connectivity state come from live Tauri IPC commands backed
  by SQLite (`netoze_app.db`) and real capture.
- No code in `src/` references `127.0.0.1:5000` anymore.

MongoDB is NOT required. Do not restore this directory.

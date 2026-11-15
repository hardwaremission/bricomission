Recorded diagnostics sessions for /stream?source=replay (or DIAGNOSTICS_SOURCE=replay).

demo-simulation-budget.ndjson is recorded by scripts/diagnostics/record-replay.sh from the dashboard's own
stream while the E2E "demo path" drives the app on the fake adapters: draft, sign-in with the email code,
one Simulation (2 photos, 2 style references) and one Budget. About 21 s, 543 events, 22 metric samples.
One JSON object per line: {"at": <ms since the start>, "frame": "event" | "metrics", "data": {...}}
"event" data is a DiagnosticsEvent, "metrics" data is a DiagnosticsMetricsSample (already redacted by the API).
Polling events are not recorded. The file is baked into the dashboard image: rebuild it after recording.

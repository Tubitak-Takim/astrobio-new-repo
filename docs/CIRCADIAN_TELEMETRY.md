# Automatic cabin ambience and mission CSV downlink

## Research and design

Spacecraft cannot rely on orbital sunrise/sunset to define a human day. NASA describes fixed sleep/wake schedules plus adjustable lighting spectrum and intensity to address repeated sunrises aboard the ISS: [Seven Ways Astronauts Improve Sleep](https://www.nasa.gov/missions/station/seven-ways-astronauts-improve-sleep-may-help-you-snooze-better-on-earth/). Timing, brightness, spectrum and individual needs matter together; a warm color alone does not establish circadian entrainment. Kelvin/CCT alone is not a measure of the biological effect of a light source.

Astrobio now computes a **shared cabin ambient-light target** automatically from a stable **Earth UTC reference clock**. UTC is an explicit engineering choice for this demo, not a claim that all locations on Earth share one morning/night or that these particular settings are NASA-approved. Personal sleep-quarter schedules remain separate, especially for different shifts. Task/emergency lighting must not be overridden by a sleep-lighting algorithm.

For real downlink, **CSV is a data format, not a communications protocol**. NASA's [Delay/Disruption Tolerant Networking overview](https://www.nasa.gov/communicating-with-missions/delay-disruption-tolerant-networking/) describes store-and-forward operation when links are delayed or unavailable. The IETF [Bundle Protocol Version 7 (RFC 9171, with subsequent updates listed there)](https://www.rfc-editor.org/info/rfc9171) describes a protocol for intermittent, delayed networks. This application demonstrates packaging, persistent queuing and time-gated delivery; it is **not a BPv7/DTN implementation or a live connection to NASA/DSN**.

## Small, glanceable UI

- **Light & Circadian Care:** one cabin card shows phase, dimmer-target percentage and Earth UTC time. It says **SIMULATION** and **Target — not measured**. Five-second server refresh updates the target. Longer settings, personal health signals, calendar, history and research are collapsed by default. Urgent/caution/review messages remain visible.
- **Reports:** **Download one CSV** and **Queue for Earth (demo)** are separate actions. Queue history/integrity is collapsed until requested or after a successful queue action. A download never claims to have transmitted anything.

## Cabin controller model

Default shared schedule per mission: wake **07:00 UTC**, bed **23:00 UTC**. Only CMO can save a different pair or switch automatic scheduling off; crew may inspect the target. The shared schedule is keyed by mission, not selected astronaut. Changing a personal wake/bed preference does not change everyone's cabin lighting.

Illustrative, continuously eased demo targets:

| Phase | Relative timing | Dimmer target | Illustrative CCT target |
|---|---|---|---|
| Morning | first 90 min after wake | 5 → 80% | 2200 → 4500 K |
| Daytime | after morning until 3 h before bed | 80% | 4500 K |
| Evening | final 3 h before bed | 80 → 5% | 4500 → 2200 K |
| Night | bed until next wake | 5% shared ambience | 2200 K |

Transitions use smoothstep interpolation and wrap across UTC midnight, including shifted schedules. These are **not measured lux, a light dose, a medical prescription or evidence of benefit**. Low shared ambience is not the lighting instruction for private sleep quarters, which can remain dark. Off means **no automatic target** (`null`), not a command to black out the cabin. No flashing, hardware command or device feedback is generated.

The backend derives the target from its current UTC clock, even if the browser was closed earlier. It does not depend on the selected synthetic mission day; that day still selects health/calendar context. Settings persist in `cabin_light_config`, with changes audited in `cabin_light_events`. The state explicitly reports `simulated:true`, `deviceConnected:false`, `commandSent:false`, `measuredBrightnessPct:null`. A failed refresh clears the displayed live target instead of pretending a stale value is current.

Real deployment needs a qualified mission-approved lighting plan, calibrated sensor/device feedback, a protected hardware adapter, safe ramp rates, manual/emergency overrides and individual/shift accommodations. These have not been implemented or verified here.

## Exactly what the single CSV contains

The report export contains **authorized structured mission records**, not an unrestricted database dump. Day range is **1 through the selected mission day** for the selected mission. Crew export themselves; CMO export all four crew. Record families:

- `health_snapshot`: complete merged daily readings with source, held-sample measurement day, observation timestamps and units;
- `manual_checkin`: original saved scalar readings, without attachments, including legacy cross-mission scope;
- `observation`: append-only ingested fields and structured symptom self-reports, including historical/superseded updates;
- `cabin_snapshot`: shared synthetic CO₂/radiation context;
- `rule_finding`: canonical levels, measured text and provenance, not LLM-generated interpretations;
- `stress_report`, `light_preferences`, `light_event`, `light_review`: saved stress, effective current personal settings (including defaults) and review/action history;
- `task_done`, `emergency_practice`: in-range task logs and simulated emergency records for authorized **patients** (being an operator alone does not add another patient's data to the export);
- `cabin_light_target`, `cabin_light_event`: current simulated cabin target/settings and configuration-change history;
- `manifest`: scope, exclusions and dataset/schema/plan versions.

**Excluded:** images and captions, private journal notes, messages, full chat/voice transcripts, sessions/tokens/PIN hashes, model files, unauthorized people and unrelated missions. Pictures/private text would need a separately approved and secured attachment workflow, not silent base64 insertion into a CSV.

Current settings/targets are stamped with export time and have no historical mission day: they must not be treated as measured historical telemetry. Personal/full check-in/task legacy keys do not contain mission; `mission_scope` marks those rows accordingly. Legacy emergency records do not store mission, so their scope is `mission_not_recorded`, not invented mission provenance. Mission-specific histories retain their actual scope and day bounds.

### Schema

UTF-8 with BOM, CRLF, quoted comma-separated fields. One scalar/JSON field per row, in one table, schema `mission-csv-v1`:

```text
schema_version,export_id,exported_at,record_type,record_id,crew_id,mission,
mission_day,measured_at,received_at,source,field,value,unit,measurement_day,mission_scope
```

Group by `record_type + record_id + crew_id + mission` to reconstruct records. JSON values hold structured arrays/provenance rather than dropping them or flattening incompatible record types into misleading columns. Use a CSV parser (not string splitting on commas/newlines). Leading spreadsheet-formula prefixes in strings are neutralized with an apostrophe; numeric values remain numeric representations. Missing values are empty, not fabricated zeroes. `rowCount` counts data records, not physical text lines.

## Export and demo downlink API

All requests require the existing bearer session header; never put tokens in URLs. Exports/queue/download operations are limited to **six/minute/account**, with a **16 MiB uncompressed CSV limit** checked during row generation and decompression. Existing Crew Data selected-person CSV remains available separately.

| Request | Behavior |
|---|---|
| `GET /api/light-plan?...` | additionally returns `cabinLighting` with live UTC targets and shared configuration |
| `PUT /api/light-plan/cabin` | CMO only; `{crewId,day,mission,config:{wakeTime,bedTime,autoEnabled}}`; strict HH:MM and 7–10 h opportunity guard; returns the normal saved receipt/plan |
| `GET /api/telemetry/export.csv?day=90&mission=mars` | builds a new authorized snapshot and downloads one CSV; onboard only |
| `POST /api/telemetry/bundles` | `{day,mission,requestId}`; creates an immutable queued snapshot; onboard only |
| `GET /api/telemetry/bundles` | latest 20 authorized summaries; Earth sees only delivered demo snapshots |
| `GET /api/telemetry/bundles/:id/csv` | downloads an authorized stored snapshot after bounded gzip decompression and checksum verification |

CSV responses include `Content-Disposition`, `X-Content-SHA256`, `X-Export-Row-Count`, `Cache-Control:no-store` and `X-Content-Type-Options:nosniff`. SHA-256 is over the **uncompressed UTF-8 CSV bytes including BOM**. The stored packet is gzip compressed in SQLite (`telemetry_bundles`). Summary metadata identifies original/compressed size, row count, scope, timestamp and digest. Downloads decompress to the same single `.csv` file.

`requestId` must be a UUID. Retrying the same creator/request ID returns the original snapshot without duplicating it; changing its day/mission returns 409. Later medical changes do not rewrite queued files. An integrity failure returns 409 without emitting CSV content.

Onboard access requires permission for **every crew ID** in a stored snapshot. Another astronaut cannot download a colleague's file, and an ordinary crew member cannot read a four-person CMO packet. Earth cannot generate live onboard exports or inspect queued packet metadata/content before the simulated delivery deadline. A missing/unauthorized/undelivered download returns 404.

Delivery is a **local demo time gate**, using the existing accelerated mission signal delay, not a verified receiver acknowledgment or a physical network transmission. API/UI metadata retain `physicalDeliveryVerified:false`. Packet data survive a server restart. Queue listing uses Refresh; no continuous outbound worker, actual retransmission/contact-window scheduling, encryption-at-rest, signatures, real receiver or retention cleanup is provided.

For actual spacecraft-to-Earth delivery, add an approved radio/optical/ground link and authenticated transfer agent; then contact-aware store/forward, chunking/resume, sequence IDs and deduplication, congestion/storage limits, receiver acknowledgments and reconciliation. Urgent health alerts should take priority over bulk historical files. Encrypt sensitive data in transit/at rest and protect identities/keys; a plain SHA-256 digest detects accidental corruption but is **not sender authentication**. Consider a mission-approved current DTN/BPv7 stack and its security extensions, not a custom CSV-over-timeout protocol. Consent, access/audit/retention controls and hardware/link testing remain necessary.

## Jury walkthrough

1. Restart `npm run dev` and refresh. Open **Light & Circadian Care**: show the current UTC phase/percentage; explain that it is a changing software target with no connected light device.
2. Under **Schedule & wellbeing settings**, C2 can change the shared UTC schedule. Switching selected astronaut leaves that mission's cabin configuration unchanged; personal schedules remain separate. Turning automatic off shows a dash, not 0% measured light.
3. Open **Reports**, choose mission/day. As C2, **Download one CSV** includes all four authorized crew through that day. Open the single file and filter `record_type`/`crew_id` to show provenance and different data families.
4. **Queue for Earth (demo)** asks for confirmation, stores a compressed snapshot and shows queued status plus integrity metadata. Download alone is explicitly not sending.
5. Sign in as the Earth flight surgeon. Before the demo deadline the packet is absent/unreadable. After the accelerated delay, Refresh Reports and download the delivered snapshot; server decompression/checksum checks protect its contents.

Tests cover phase bounds/continuity/shifted clocks/off semantics, CMO-only shared edits, glanceable collapsed UI, CSV units/scope/privacy/formula escaping, the full 90-day cohort under the size limit, immutable compressed packets, duplicate-safe retries, corruption detection, early-Earth/other-crew denial and session/context-safe browser downloads. Real-browser layout/accessibility, calibrated lights and real Earth-link tests remain manual/unverified.

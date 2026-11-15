# Natural, authorized data questions and daily circadian widgets

## Fixed regression

The question **“Şuanda uzay aracı içerisindeki ışık oranı ne durumda?”** previously went to stateless general chat without current cabin data. The model therefore guessed a generic explanation. It now triggers a read-only server query for `cabin_light_config` and the current UTC-driven controller target.

The reply identifies the actual calculated percentage, phase, illustrative color target and **UTC check time**, and explicitly distinguishes a simulation target from measured light. No lamp is connected and no command was sent. Off means no automatic target, not a measured 0%. Required facts are rendered from the server even if the local model is missing, fails, or chooses an irrelevant optional fact.

## What “data access” means

`server/dataContext.ts` maps natural application questions to fixed, parameterized, permission-checked reads. The resulting factual packet goes to the local conversational model through `AUTHORIZED_APPLICATION_CONTEXT`. This is **not unrestricted SQL, filesystem access, a database dump loaded into model weights or permission to write records**.

| Questions / examples | Server source |
|---|---|
| “Şu an ışık oranı ne?”, “Current cabin brightness?” | Current shared cabin target/configuration and live Earth UTC clock |
| “Nabzım kaç?”, “Astronot 1’in tansiyonu kaç?” | Authorized selected readings and saved field overlays, with source/stale-rule caveats |
| “Stresim kaç?” | Exact selected person/day/mission stress self-report; missing is not zero |
| “Sirkadyen planım nasıl?”, “Bugünkü ışık programım?” | Personal preferences and **one selected mission-day plan** |
| “Şu anki CO₂ oranı kaç?” | Selected-day synthetic cabin CO₂/radiation, clearly not sensor measurements |
| “Notlarımı göster” | Up to three selected-person/day journal notes, only on explicit request |
| “Görevlerim neler?”, “Acil durum kayıtlarım” | Bounded selected-day task/practice records for authorized subjects |
| “Mesajlarımı göster” | Bounded messages with existing identity and delivery checks |
| “CSV paketleri ne durumda?” | Up to three matching packets in the latest 20 authorized metadata entries; demo delivery is not physical receipt |
| “Bütün verilerimize erişebiliyor musun?”, “All crew overview” | Compact authorized data inventory/summary, not every raw record in one prompt |

Crew can access only themselves plus shared cabin data; CMO can request authorized crew or a bounded cohort summary. Explicit `C1`–`C4` / “Astronot 1” references are checked before retrieval/model use. Unauthorized references return 403, even if the UI selected a different authorized person. Earth keeps its existing onboard-chat restriction and can read delivered CSV snapshots through Reports instead.

The selected day/mission comes from the existing chat context controls. Current cabin lighting instead uses the **live server UTC clock**, and the response says so. Notes, tasks, emergency practices and messages have legacy person/day scope where mission was not recorded; sources identify that limitation. No future-day health records or unrelated mission-specific records are attached.

Journal/message text is **not** added to broad “all data” overviews, ordinary conversation or general health education. It is retrieved only for a specific request. Text is quoted as untrusted user data, capped at 300 characters per note/message with a visible truncation marker. Other bounded lists also identify their limits. Credential/session/PIN material, image contents, model files and unauthorized records are never supplied.

Full structured histories remain available in the authorized Reports CSV. Natural retrieval does not imply that every historical row, photo or arbitrary free text is loaded into every model request. Conversation history itself remains stateless; saved health self-reports remain separately durable.

## Grounding and safeguards

- New `route:"data"` uses local Qwen to choose only existing fact IDs, with a strict `{factIds:[...]}` schema (up to six optional selections). No model-generated numeric values, device claims, clinical diagnoses, SQL or write instructions are accepted.
- Relevant mandatory values/provenance cannot be suppressed by a poor selection. The server renders complete existing facts; if a concise response cannot fit all facts, it reports the omission and suggests a narrower category or CSV.
- A malformed/extra-field/truncated/unavailable model response yields an explicitly labeled **server-data answer**, not an invented explanation.
- Read queries do not save new symptoms, stress values, schedules or transmission requests. Existing conservative self-report extraction, voice transcript confirmation and urgent handling remain intact. Urgent findings bypass model selection and retain the warning alongside the requested facts.
- Existing full health-record review still uses `healthContext.ts` and the medical/companion flow with canonical values/rules. Ordinary conversation/general education do not attach application records merely because a model was called.
- Client-supplied `healthContext`, `applicationContext`, numbers, credentials or fact IDs are not trusted as database context.

Response metadata `dataContext:{topics,subjectIds,mission,day,sampledAt,sources,omittedFacts,readOnly:true}` lets Ask to AI show a short **Server data · … · Checked … · Read-only** provenance line. A read-only answer does not display a misleading “health record not saved” warning.

## Daily page layout

`circadian-demo-v2` returns `schedule` as a **one-item array for the selected mission day**, retaining the API field shape. Overnight sleep may end on the next day; that is a continuation, not an additional day report. Stored preferences, historical events and queued CSV snapshots are not erased.

Above the detailed explanations, Light & Circadian Care now has visible compact widgets for:

- current cabin phase/target/UTC;
- selected-day sleep/mood/stress/source summaries;
- editable personal schedule, own stress check-in and CMO-only shared cabin controls;
- the daily plan and reminder actions;
- recent saved activity and red-light review status/request.

Only long plan explanations, full event details and research/evidence/safety text are in bottom disclosures. Sleep/mood values remain correctly labeled **rolling seven-day metrics on the selected day**; they are not relabeled as measurements from a single night. The seven-day calendar/report itself has been removed.

## Validation

Regression tests cover the exact Turkish question, English/natural phrasing, current UTC percentage/off mode, model-visible facts, numeric/extra-field rejection, disabled-model fallback, read-only retrieval, explicit-subject permissions, latest ingested vitals, stress/daily-plan context, private/future/undelivered-record exclusion, journal access only on request and visible daily widgets.

A real smoke test used the user's configured **qwen3:1.7b** with an **in-memory fictional test context** (no changes to the existing health database or settings). Selection generated successfully and the answer preserved the server's **80% / daytime / 4500 K** target with check timestamp and no-device disclaimer. This verifies that the local model receives the facts; it does not validate circadian efficacy, hardware or clinical safety.

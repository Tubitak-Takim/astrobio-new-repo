# ASTROBIO frontend

The supplied HTML/CSS/JavaScript design and the new Crew Data explorer are integrated with the existing Node API. No React build or separate frontend server is required. Active interface copy, navigation, accessibility labels, dates and numbers use English; chat replies may follow the selected conversation language.

## Run

From the project root, run `npm ci` and `npm run dev`, then open **http://127.0.0.1:8787/**. Use the configured `API_PORT` if different. Open the Node server, not Live Server or `file://`; the frontend and API must share the same origin.

The demo PIN is **2026**. Crew members see their own server records; the crew medical officer sees authorized crew records; ground staff see delivered messages. Authorization is enforced on the server. Session tokens are held in this tab's sessionStorage. Signing out invalidates the server session. Demo authentication is not suitable for production.

## Page responsibilities

- **Compact circadian / export additions:** the lighting page's first card now shows the mission-shared UTC-driven cabin target; settings/calendar/research/history are collapsed by default. CMO-only cabin settings are separate from personal sleep preferences. Reports has two explicit actions, **Download one CSV** and **Queue for Earth (demo)**, with authorized structured records, compressed snapshots, integrity metadata and delayed Earth-only access. No real lamp or spacecraft downlink is connected. [Research and demonstration](../docs/CIRCADIAN_TELEMETRY.md).

- **Light & Circadian Care:** personal mission-clock preferences and seven-day calendar, warm pre-sleep/dark sleep planning, stress self-reports and automatically suggested medical/sleep-plan reviews. Red-light content is research-review-only, never a device/dose/treatment controller. Available from the sidebar, with authorized subject/mission/day controls and server persistence. [Evidence, jury demo and API](../docs/LIGHT_PLAN.md).

- **Live Monitoring:** authenticated partial ingestion, manual measurements, clearly labeled browser-generated demo start/stop controls, two-second monitoring, durable receipts/source/timestamps and recent history. No sensor hardware is implied. Ask to AI displays structured headache-report save receipts for the signed-in astronaut; see [jury demo and API](../docs/LIVE_MONITORING.md).

- **Crew Data:** four distinct NASA-inspired fictional scenarios, 90 days, mission/person selection, six time series, descriptive correlations/scatter plots, recent records and selected-profile CSV. The server seeds 1,080 snapshots (four crew × 90 days × three missions) separately from manual check-ins. Sign in as C2 to compare all crew. This page has no generic backend connection panel. [Dataset provenance and limitations](../docs/SYNTHETIC_CREW_DATA.md).

- **Interactive Health Check:** the only page displaying the **ASTROBIO · AUTHORIZED BACKEND CONNECTION** panel. It contains sign-in, mission day, authorized subject/cabin selection, canonical findings, sources, measurement age and full-day check-in forms. The anatomical map below it is a separate visual demo, not a regional assessment of the selected person.
- **Daily Indicators:** Sleep Analysis, Recovery, Daily Load, Mission Health and Daily Insights show their own lightweight design content, without the backend connection panel or health-data requests.
- **Main Panel / Measurements / BIS Analysis / RIDGE:** synthetic design examples without the connection panel. Follow the Health Check link to enter authenticated measurements.
- **Ask to AI:** its own sign-in and chat workspace, without the health connection panel. Uses `/api/chat`, English requests, model/voice status, explicit microphone consent, an editable transcript and confirmation before sending. Chat stays in memory and is cleared on navigation, context changes or sign-out. Playback uses the server's short-lived reply receipt.
- **Reports:** its own workspace for canonical server reports, downloads, explicit delayed delivery and messages. Ground staff can select a recipient. Refresh retrieves newly delivered messages; this is not a real Earth communication link.
- **Personnel Info:** the authenticated account's server identity.
- **Calendar:** server mission-day notes plus a separate local design calendar. Local calendar notes remain browser-only and are clearly labeled.

## Synthetic data remains separate

Ring scores, BIS / Cole curves and daily insights use a synthetic dataset. The backend has no BIS measurement field, so these values are not fabricated from unrelated backend measurements. Never treat the design scores as clinical assessments.

Example JSON imports and local calendar notes use localStorage. Existing saved notes and imported records are preserved; legacy Turkish quality/day labels are normalized to English for display without rewriting user content. Do not import sensitive health data. Existing Turkish URLs remain valid to avoid breaking bookmarks.

## Local AI and voice

`npm run setup:voice` prepares optional speech dependencies and weights after separate license approval. Start `npm run voice:server` in another terminal. Local models and voices use existing `.env` settings; the frontend does not select or replace models.

The UI stays English, but **Reply / recording language** supports Auto, English and Turkish. Auto uses a lightweight message-language heuristic and keeps the last detected language for ambiguous messages; choose a language explicitly for predictable recording/transcription. Reply introductions and service/disclaimer text use that same language. This does not add multi-turn medical memory.

Messages do not require a selected finding: Qwen3 1.7B handles general chat, while MedGemma receives health-education questions directly. Medical generation uses a JSON contract with one final `reply` field. The output rules are also included in the medical user turn because some imported Gemma templates omit system messages. Internal thought tokens, draft/critique headings, unexpected JSON fields and length-truncated responses are rejected, not shown or read aloud. These presentation checks do not guarantee clinical correctness. Generated health text is not a personal diagnosis. Emergency warnings and canonical server findings remain authoritative. Previous chat messages are not attached automatically.

**Database-backed record review:** ask “Analyze my health records” or “Genel sağlık verilerimi analiz edebilir misin?” The server snapshots only the selected authorized person/day (or cabin), including current structured measurements, baseline, rule levels, source/age/stale metadata and up to seven prior saved summaries of vital signs, sleep, body mass and headache. Only three priority findings include detailed reasoning in the model context. Other people's records, names, photos, journal notes, messages and session data are excluded. A missing check-in is labeled as a synthetic feed, never as a saved measurement; old check-ins are not carried into a later day.

The record-review response preserves exact values and canonical rule levels rather than trusting free-form medical claims from either small model. MedGemma's explanation is optional and checked for unsupported numbers. Qwen chooses a conversational opening and relevant existing finding IDs; the server guarantees flagged/stale findings take priority, renders the source facts, dates and source labels, and compares the latest two saved records without asserting a clinical trend. If a model output cannot be verified, a clearly labeled server/rule summary is still available. This is not a diagnosis or clinically validated analysis. Ordinary conversation and general health education do **not** attach database context.

Run `npm run setup:companion` to install/enable Qwen3 without repeating MedGemma or voice setup. Full `setup:local-ai` includes both model roles and optional speech. Missing models produce an explicit service notice, not a fake AI reply. Models are stateless between turns. Playback still uses your configured Piper voice. If that voice is Turkish, configure an appropriately licensed English voice separately. Microphone access requires localhost/HTTPS and a user action; there is no automatic recording.

## Files and attribution

- `js/shell.js`: shared English navigation, header and accessibility labels.
- `js/app.js`, `js/data.js`, `css/style.css`: design pages and clearly labeled synthetic examples.
- `js/backend.js`, `css/integration.css`: authenticated same-origin workspaces; domain code stays on the server.
- `js/anatomy.js`: optional Three.js anatomy viewer with a 2D fallback when unavailable. Icons and 3D libraries use CDNs; core health/chat APIs do not depend on them.
- `assets/models/anatomy-male.glb`: optional local model; no large anatomy model was supplied.
- Anatomy references: [Open Anatomy 3D](https://github.com/MervinR07/open-anatomy-3d), BodyParts3D © DBCLS, HuBMAP and MakeHuman. Review the [upstream attribution](https://github.com/MervinR07/open-anatomy-3d/blob/main/ATTRIBUTION.md) and the license of any model you use.
- Planet images were not supplied, so CSS fallbacks are available. You may add licensed `assets/leo.jpg`, `assets/moon.jpeg` and `assets/mars.jpeg` files.
- [English project overview](data/ASTROBIO_Project_Overview.html). The [original design notes](DESIGN_ORIGINAL.md), [design mapping](TASARIM_ESLESTIRME.md) and original Turkish PDF are retained as historical source material, not active English UI copy.

This is not a medical device; readings are simulated. Real-browser visual, WebGL, accessibility, microphone and speaker validation is still required.

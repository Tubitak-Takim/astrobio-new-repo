# Progress

> Historical development log. Earlier entries describe the previous prototype, not the current backend-only Astrobio release. See the latest entry and README.md for current scope.

## Session 1 (2026-11-10)

### Done
- Research pass on every claim in brief section 7. Results in `RESEARCH_LOG.md`.
- Real NASA data downloaded: `data/osdr/OSD-569_CBC_TRANSFORMED.csv` (Inspiration4 blood counts, pre/post flight).
- App scaffold: Vite + React + TypeScript + Tailwind. `npm run dev`, `npm test`.
- `src/data/sources.ts`: one entry per threshold, each marked verified / partial / demo.
- `src/triage.ts`: Earth rules and space rules as pure functions. 14 unit tests pass.
- `src/data/simulatedCrew.ts`: replaces the old TS file. Old file and the Gemini notes are in `legacy/` (not used by the app).
- Screen 1 (dashboard): crew + cabin cards, mission-day slider, simulated badge, Earth/Space toggle, traffic lights, findings with reason, next step and source, disclaimer.

### Changes from the brief (and why)
- Added a **Cabin** card. CO2 and radiation belong to the cabin, not one person.
- Headline now counts **false alarms and missed concerns**. Earth rules also *miss* things (CO2 headaches), which is a stronger story than "Earth rules panic".
- Neck-vein stagnant flow stays amber in space mode. It is common in flight but 1 of 11 crew got a clot, so calling it "normal" would be wrong.
- Removed the drug list, all dosing text, IJV velocity trigger, ONSD 5.8/6.2 cut-offs, plasma-volume and bone-marker fields. None had a source.
- Radiation is tracked in mSv only (1.8 mSv/day, Curiosity cruise measurement). The old Gy/Sv mix is gone.
- Recharts not installed yet. Nothing on screen 1 needs a chart.

## Session 2 (2026-11-10)

### Done
- Full redesign of the dashboard (design mockup: https://claude.ai/artifact/EkFJhPvHUjkpnKuadr1fvE).
- Every signal now shows the Earth verdict and the space verdict side by side, a 30-day trend, and an expandable reason / next step / source.
- Mission timeline: flagged signals per day under both rule sets.
- `src/model.ts`: data layer. Crew check-ins are saved in the browser and re-checked by both rule sets.
- "Log a check-in" form, "Copy report for Earth" button.
- Emergency mode (`src/Emergency.tsx`): 7 steps, Space to advance, timer. Steps tagged "from guideline" or "demo only".

### Decisions made for the team (no specialist needed)
The earlier open questions are closed this way: any number we could not confirm in a paper is shown in the app as
"Demo parameter" or "exact number still to be re-checked". Nothing unconfirmed is presented as fact. If a mentor
or judge with a medical background offers a better number, change it in `THRESHOLDS` in `src/triage.ts`.

## Session 3 (2026-11-10)

### Done
- **Backend** (`server/index.ts`): API + SQLite database file (`data/crew-health.sqlite`). Stores check-ins, validates them,
  re-checks with both rule sets, keeps an activity log, serves a text report. Uses only what ships with Node 24, and imports
  the same `src/triage.ts` the screens use, so there is one copy of the rules. If the server is down the app saves on the device.
- **3D body view** (`src/BodyScan.tsx`, `src/body/sdf.ts`): male and female body built from 24,000 points, drag to turn.
  The region of each flagged signal glows amber or red (eyes, head, neck vein, heart and lungs, blood). Markers open the signal.
  It is a body-shaped guide, not an anatomical model with organs.
- **Redesign**: neutral interface where colour appears only when something needs attention. Own logo mark, Geist type,
  Phosphor icons, press feedback on every button, animated numbers, sliding selection, expanding rows, toast after saving,
  step transitions in Emergency. All motion switches off for people who ask for reduced motion.
- Cabin view: ring gauges for CO2 and radiation dose.

- **Real organs** (`public/anatomy/`, `src/body/anatomy.ts`): 16 organ meshes and the skin from BodyParts3D
  ((c) The Database Center for Life Science, CC BY 4.0, credit shown on screen). One adult male. Male crew use the real
  skin and organs. Female crew keep the generated body with the same organs fitted inside (approximate, labelled).
  The left neck vein is the right one mirrored, because the dataset has no left one. No spleen in the dataset.

- **Session 4:** body is now a smooth surface, no dots. Female crew use a real female body and organs (HRA 3D Reference
  Organs, Visible Human female, HuBMAP, CC BY 4.0); male crew use BodyParts3D. Credits show under the body. The female set
  has no neck vein mesh, so that marker sits on the neck without an organ. Body panel no longer moves when a signal opens.
  Database status label removed.
- **Known gaps before this is more than a demo** (see chat of 2026-11-10): no sign-in or roles, no device data feed,
  no label saying where each reading came from, no daily task view, emergency covers one scenario only.

## Session 5 (2026-11-11)

### Done
- **Sign-in and roles**, enforced on the server (`server/index.ts`, `src/data/users.ts`): crew see their own data, the medical
  officer sees everyone, the flight surgeon sees only what was sent to Earth. Demo accounts share PIN 2026.
- **Simulated device feed** (`src/model.ts`, `FEEDS`): wearable values arrive daily, ultrasound every 14 days, blood every 30.
  Every signal shows its source and age, and warns when it is getting old. The check-in form is now the manual fallback.
- **Today tab**: tasks worked out from the feed and the space rules, a free-text "how do you feel" note, messages from Earth,
  and a crew overview for the medical officer.
- **Earth link tab**: messages and health reports travel with the signal delay for the mission day (played 60x faster),
  with a countdown. Sign in as the flight surgeon in a second browser tab to answer from Earth.
- **Emergency**: three scenarios, a patient picker, a "sensors point here" hint, timed steps, and a saved record that is
  sent to Earth automatically.
- Layout: the three Crew health columns share one fixed height and scroll inside, so the body no longer slides over the timeline.
- Male body surface rebuilt with smooth shading (no speckle).

### Still not real
No real devices, no real identity system, no encryption, schedules and stale limits are demo values, emergency steps
marked "demo only" are our wording. The database keeps test messages from development; delete `data/crew-health.sqlite` to reset.

### How to run
`npm run dev` starts the API (port 8787) and the web app (port 5173) together. `npm test` runs the rule tests.

### Next
1. Paste the challenge page text into `CHALLENGE.md` and check scope against it.
2. Optional: find a licensed female anatomical model.
3. Deploy a demo link and rehearse the 3-minute demo.

## Session 6 (2026-11-11)
- Body view: wheel and pinch zoom, zoom buttons, Head / Chest / Body presets, system layers (heart and blood; brain, eyes, spine; organs). Opening a signal moves the camera to it.
- Spinal cord added for the female body and the spine for the male body. Neither free dataset has the small peripheral nerves.
- Signals panel: flagged signals first with a "Do this next" box and action buttons; normal signals compact.
- Earth link: fixed-height thread, long reports collapsed to a summary.
- Not taken from the outside suggestion list, because no source exists: kidney-stone and bone-loss numbers, shock index, jugular velocity cut-off, Muller maneuver.

## Session 7 (2026-11-11)
- Blood vessel trees on both bodies (male to wrists and ankles, female trunk only). No peripheral nerves exist in either free dataset.
- Two new signals with sources: urine output (kidney stone risk) and resistance exercise (bone loss). 16 rule tests.
- Ask tab: offline assistant with no AI model, answers only from readings, rules and emergency steps (`src/handbook.ts`).
- Browser fallback backend (`src/localBackend.ts`) so the app runs with no server.
- README rewritten with screenshots in `docs/`.
- Deployed: https://crew-health-monitor.vercel.app (static, uses the browser fallback).

## Session 8 (2026-11-11)
- Challenge page finally read. Scope check is in CHALLENGE.md.
- Added the indicators the challenge names: mood, blood pressure, temperature, blood sugar (ordinary Earth limits, labelled demo parameters). 18 rule tests.
- Each signal now explains the measurement and names its NASA hazard (`src/data/signalGuide.ts`).
- Demo link shows a banner saying it has no server. Sign-in screen states that everything is simulated.
- First load split: 3D view loads only when Crew health opens (main file 485 kB, was about 1 MB).
- 3D performance fixes, optional Gemini rewording (`api/reword.js`, off without a key).
- DEMO_SCRIPT.md added.

## Session 9 (2026-11-11)
- Reviewed outside feedback (Sonnet, Gemini). Applied Sonnet's patch: white cells, vitamin D and body mass signals, and image attachment on check-ins.
- Replaced guessed white cell ranges with the real lab ranges and pre-flight values from NASA OSD-569.
- Added body markers, Ask words and tests for the new signals (21 rule tests).
- Trend chart: up to three signals since launch, under the crew health screen.
- Verdict chips now say Earth or Space on each chip. Normal body markers are easier to see. Roles no longer cut off.
- 3D body shows a loading message and a failure message. Rewording endpoint is rate limited.
- Not done: mission selector (ISS / Moon / Mars), images sent to Earth.
- ADNI brain scans (Alzheimer's study) were offered as data. Not used: wrong population, and its licence does not allow republishing.

## Session 10 (2026-11-11)
- Mission setting: space station, Moon surface, Mars transit (`src/data/missions.ts`, `src/MissionMenu.tsx`). Changes the Earth link delay and the radiation rate, each with a source. 23 rule tests.
- Custom setting menu instead of the browser dropdown. Header kept to one row.

## Session 11 (2026-11-11)
- Station radiation rate now rests on three peer-reviewed measurements; the Moon rate is confirmed as the only surface measurement. Station delay sourced to NASA.
- Moon gravity: the simulation applies 60% of the weightless fluid shift (demo parameter from a partial-gravity study), and gravity-related signals carry a note on the Moon. 24 rule tests.

## Session 12 (2026-11-13)
- Read the challenge's required resources (NASA hazards, risks, ongoing research; two Canadian Space Agency pages).
- Every signal now links to its official NASA risk, and names the matching current NASA study where one exists (`NASA_RISK`, `NASA_STUDY` in `src/data/signalGuide.ts`).
- Bone loss source upgraded to NASA's own page. Four facts from the resources added to the explanations. 25 rule tests.

## Team adaptation (2026-11-14)

- Development ownership: Işıkhan IŞIK (AI-ML), Muhammet Kerim Şahin (backend), Elif Nur Özek (frontend), Zehra Kaygısız (integration/testing). These are developer roles, not simulated astronaut accounts.
- Preserved the reference UI for a later original frontend design. Added team, API, backend reuse, frontend handoff, AI-ML, and quality documentation.
- Added server-side `/api/assessment` with role-filtered findings and source metadata, so a replacement frontend does not need the React/3D implementation.
- Shared message/emergency access policies, addressed Earth replies, larger report budget, safer JSON parsing, login throttling, session expiry and local rewording authentication.
- Fixed contradictory high-CO2 text, conservative low-WBC review handling, browser persistence error reporting, and premature check-in form closure on failure.
- Added HTTP integration, privacy, validation, report budget and regression tests. Updated Vitest and added CI.
- Verification: 47 tests passed; TypeScript and production build passed; npm audit reported zero vulnerabilities. The reference frontend still has chunks larger than 500 kB; no browser-based end-to-end or clinical validation was performed.
- Measurement-level history, real authentication, production data protection, clinical review and the new frontend remain open; see `docs/QUALITY.md`.

## Astrobio backend-only transition (2026-11-14)

- Renamed the package, current documentation, server startup message and CI workflow to Astrobio.
- Removed the old React screens, CSS, browser API adapter, localStorage demo backend, browser image helper, 3D code/assets, screenshots and generated frontend output. No replacement frontend was scaffolded.
- Removed frontend runtime/build dependencies; retained only TypeScript, Node types and Vitest as direct development dependencies. Vitest may still use Vite internally as a test tool.
- Moved optional rewording to `server/reword.js` and removed its standalone Vercel handler. The authenticated Node `/api/reword` route remains available.
- Preserved domain rules, sources, simulation, validation, handbook content, API routes and existing database path. Replaced browser-demo tests with direct privacy-policy tests and retained HTTP coverage.
- `npm run dev` now starts only the watched Node API. `npm start` / `npm run server` start it without watching. `npm run build` is a type check and does not generate a web bundle.
- Verification: all 47 tests and TypeScript checks passed; npm audit reported no vulnerabilities; documentation links passed and the existing SQLite file's SHA256 was unchanged.
- The new frontend will be developed independently by the team using the API contract in `docs/API.md`.

## Local AI / MedGemma preparation (2026-11-14)

- Read Google's official MedGemma catalog, model card, getting-started guide and HAI-DEF terms, plus Ollama import/chat/inventory/local-only documentation. Official releases found: MedGemma 1.5 4B and MedGemma 1 4B/27B; no official 7B found. No substitute model selected.
- Observed approximately 32 GB system RAM, an RTX 4060 Laptop GPU with 8 GB VRAM, and installed but unreachable Ollama. A verified quantized 4B model is the recommended first candidate, subject to user selection and license review; actual GPU inference remains untested.
- Added an opt-in, loopback-only Ollama adapter and authenticated `/api/ai/status` / role-filtered `/api/ai/explain` endpoints. Only a server-selected finding and its sources are sent; no free-form medical chat, images, database changes or automatic cloud fallback.
- Added conservative bypasses for urgent/stale data, response/time/concurrency limits, remote-model rejection, original-text retention and an explicitly limited new-number check.
- Added `npm run ai:check`, a non-executable-until-configured Modelfile template, environment examples and research/setup documentation in `docs/LOCAL_AI.md`. Existing `.env`, model weights and model terms were not modified/downloaded/accepted.
- Verification: 63 tests passed using mocked/local protocol-stub inference, TypeScript passed, audit reported zero vulnerabilities, and documentation links passed. The real readiness check returned disabled as expected; no real-model performance or clinical validation was performed.

## Consent-based local AI installer (2026-11-14)

- The user selected/downloaded the Ollama tag `medgemma1.5:4b` and shared a generated API response. A later hardware inspection found working NVIDIA driver visibility but no `ollama-cuda` package on EndeavourOS; actual GPU inference still needs verification.
- Added `npm run setup:local-ai` with an interactive confirmation or explicit `--yes`, existing-model reuse, missing-model streaming download, a synthetic production smoke test and loaded-model CPU/GPU/mixed/unknown reporting.
- The installer validates local-only endpoints and remote-model metadata, does not run system installers or start background services, and prints setup instructions if Ollama is unavailable.
- Existing configured models/settings are preserved unless explicitly changed. Successful setup enables only local AI dotenv fields, saves a private backup when needed and writes a reviewable `local-ai/model-lock.json`. Digest changes require `--update-lock`; generation/verification happens before settings are saved.
- Added safe dotenv persistence, digest validation, download, smoke and filesystem tests. Verification: 80 tests passed, TypeScript passed, audit reported zero vulnerabilities, documentation links and diff whitespace checks passed.
- The actual CLI help was exercised; the real installer was not run with consent, so no real model download/generation or user `.env` change was performed in this implementation task. Users should run the installer themselves and review/commit the generated model lock.

## Dual-agent and voice pilot preparation (2026-11-14)

- Added a stateless `/api/chat` orchestration boundary and authenticated pipeline status. The medical role processes a server-authorized single finding; its experimental draft is placed in a structured packet with canonical rule data. The communication role can select only an approved empathetic opening for health responses; it cannot rewrite clinical facts.
- Conservative greeting-only social scope, explicit AI identity, original-finding retention, urgent/stale bypass and shared Ollama generation slot. Sequential dual-role calls request unload with keep_alive=0. Crisis phrases are heuristics, not validated clinical triage.
- Reserved an unset companion model and extended the installer with `--role companion`, separate dotenv fields and separate companion-model-lock.json. Existing user medical lock/settings were not modified.
- Added consent/auth/bounds-controlled WAV transcription and receipt-based speech synthesis endpoints. Transcripts require explicit user confirmation before chat. Reply receipts are per-user, bounded, expire after two minutes and are not persisted.
- Added an optional CPU-only faster-whisper/Piper Python loopback service using pre-provided local weights, plus an AudioWorklet push-to-talk browser helper for the future frontend. No always-on listening, cloud fallback, full-duplex streaming, model/voice downloads or automatic speech dependency installation.
- Consulted upstream faster-whisper/Piper APIs and a Turkish voice card; the inspected voice has non-commercial dataset restrictions and was not selected as a default.
- Verification: 98 Node tests, 6 Python fake-engine protocol tests, TypeScript check, browser-helper syntax check and Node audit passed. Real second-model, microphone/playback, voice quality and optional Python package integration remain untested; see docs/DUAL_AGENT_VOICE.md. No new weights were installed or actual user audio captured.

## Consent-gated automatic speech setup (2026-11-14)

- Included speech preparation by default in setup:local-ai, with voice-only/setup:voice, explicit skip-voice and a separate voice-license acknowledgement. Non-interactive --yes alone cannot authorize the default voice candidate's non-commercial dataset conditions.
- Added isolated Python 3.11/3.12 venv provisioning (existing uv can provision Python if needed), venv-only pip requirements + pip check, public HF asset downloading with immutable revisions and SHA256 manifests, and a synthetic Turkish TTS-to-STT smoke test before activating voice dotenv settings.
- Managed defaults are multilingual faster-whisper-small and Piper tr_TR-dfki-medium after explicit license review. Existing custom assets/interpreters are preserved; complete untracked assets are not falsely attributed to a remote revision. Modified/partial files require review instead of silent overwriting. Voice manifests can be reviewed/committed separately from ignored weights.
- Kept runtime inference offline and service startup explicit. Installer subprocesses do not receive unrelated application/HF keys; system Python installs, administrator commands and microphone recording are not performed.
- Verification: 110 Node tests, 14 Python fake-asset/engine tests and typecheck passed. The real no-license non-interactive path was exercised and refused setup without downloads/settings writes. Full real dependency/model installation was not run or claimed validated; it requires the user's voice-license consent.

## Supplied frontend integration (2026-11-15)

- Moved the user's supplied 14-page HTML/CSS/JS design into `frontend/`, retaining assets, demo JSON, PDF, design notes and anatomy attributions. Verified every source frontend file was transferred before deleting the explicitly requested `arayuz-planlaması/` staging folder.
- Added same-origin static serving on the existing Node port, restricted to the frontend tree and the voice client; private dotenv, database, source and model paths are not served. No existing user database, dotenv, models or model locks were modified.
- Connected authentication, role-filtered server assessments with provenance, complete check-in forms, server notes, stateless chat, explicit microphone/transcript/speech consent and canonical delayed reports/messages. Earth access remains server-restricted. No automatic companion model selection or microphone capture.
- Kept standalone BIS/Cole plots and ring scores explicitly labeled as independent synthetic design demos; no fabricated mapping to backend measurements. Original demo calendar/import storage remains separate from authenticated server records.
- Added happy-dom as a development-only test dependency. Validation: 121 Node/DOM tests and 14 Python tests passed, TypeScript passed, npm audit found no vulnerabilities. HTTP tests cover all pages/assets, HEAD support and private path rejection; DOM tests cover layouts and authenticated adapter/voice confirmation flows with mocks. Actual visual browser/WebGL and microphone/speaker validation remains manual.

## English interface and focused health panel (2026-11-15)

- Restricted the authorized backend connection panel, findings and check-in controls to Interactive Health Check. Daily indicator pages, the main panel, measurements, BIS and RIDGE no longer mount the panel or request authenticated health data. AI, reports, personnel and server notes retain their own purpose-specific workspaces without the generic connection heading.
- Converted active interface copy, shared navigation, page metadata, accessibility labels, forms, statuses, data-quality labels, dates/numbers, exports and anatomy fallback messages to English. Added an English project overview while retaining original source documentation/PDF as historical material.
- Chat and STT now request English. Existing local models, voices, dotenv, database and user content are not modified; the UI notes that English TTS quality depends on the configured voice. Legacy local demo records remain readable without rewriting stored content.
- Added regression tests for panel placement on every route and English UI rendering/request language. Validation: 134 Node/DOM tests and TypeScript checks passed; real-browser visual, WebGL and microphone testing remains manual.

## Direct messages and selected Qwen3 companion (2026-11-15)

- Removed the open-ended `needs_context` refusal and greeting-only allowlist. Non-urgent messages are forwarded verbatim to local generation without a finding selection: Qwen3 handles general conversation; MedGemma handles health-education questions, with the companion choosing only an optional warm opening. Existing canonical finding/urgent/stale behavior remains available for the explicit finding API path.
- Added bounded stateless direct generation with local model/remote-proxy verification, shared inference lock, time/output limits, `think:false`, reasoning-field omission and transparent service notices on failure. No records/history are implicitly sent in a free-text turn. Generated health education is labeled experimental, not a personal diagnosis; prompt instructions are not a correctness guarantee.
- User selected `qwen3:1.7b`. Verified the Ollama library card (approximately 1.4 GB Q4_K_M, Apache-2.0). Installer now prepares medical → companion → voice by default; `setup:companion` installs just the companion using a separate dotenv prefix/lock. Existing custom models and successful earlier phases are preserved. No real model/weight installation or user dotenv/lock modification was performed for this change.
- Added direct-message API, model failure/output/privacy/concurrency and sandboxed installer workflow tests. Validation: 147 Node/DOM tests and typecheck passed with fake Ollama; actual Qwen3 inference, GPU/quality and multi-turn memory remain unverified/out of scope.

## Final-answer-only output and conversational language (2026-11-15)

- Investigated a user-visible Gemma thought/draft leak. Read-only Ollama template inspection showed the imported medical template can omit system messages. The prior think:false plus `<think>`-only guard did not cover Gemma `<unused94>` thought markers or token-budget truncation.
- Added a strict one-field medical reply JSON contract, repeated output instructions in the medical user turn without modifying the user's installed model/template, and shared final-answer screening for known special tokens, draft/critique/revision headings and planning prose. Length-truncated outputs are withheld. Bad drafts are never selected/repaired into an asserted medical answer or sent to the companion/TTS; users get a transparent localized retry notice. These guards are heuristic, not a correctness guarantee.
- Kept English interface copy while adding Auto/English/Turkish chat/recording language selection. Auto sends a concrete en/tr value based on message-language hints and the last inferred language, so Turkish questions no longer receive English canned introductions/disclaimers. No patient history or transcript persistence was added.
- Validation: 178 Node/DOM tests and typecheck passed. Also ran the actual installed MedGemma + Qwen3 sequentially on two synthetic Turkish educational prompts (sleep and a fictional headache scenario). Both roles returned generated status and final Turkish replies without draft/thought markers. No real patient records/audio were used; this verifies the output path, not clinical accuracy or comprehensive language/GPU quality.

## Authorized database-backed health record review (2026-11-15)

- Added a server-built health context for explicit record-analysis requests, without requiring a finding selection. It uses the selected authorized subject/day, current saved check-in or explicitly labeled simulated fallback, baseline, canonical findings/provenance/source status, and up to seven previous saved vital/sleep/body-mass/headache summaries. Detailed reasoning is limited to three priority findings and the entire packet is bounded. Future/other-subject records, names, attachments, notes, messages and client-forged context are excluded. General chat and standalone health education do not attach records.
- Reused the exact same database snapshot for the authorized assessment and model context; old saved check-ins are not silently carried forward. Responses identify origin, selected day, history count and stale flags. Exact values, limited two-record comparisons and rule states are rendered by the server, not invented by the models.
- Real synthetic-record testing exposed MedGemma numeric errors/truncation and inaccurate free-form Qwen interpretations despite successful generation. Added a numeric grounding check and changed the record communication contract to approved opening plus existing finding IDs only. Unverified drafts never reach Qwen. Flagged/stale findings cannot be hidden by a model selection; failed generation/selection produces an explicitly non-model server/rule summary. Ordinary educational replies keep their existing final-answer-only contract.
- Validation: 193 Node/DOM tests and typecheck passed, including real HTTP/temporary SQLite isolation and forged-context rejection. Real installed MedGemma/Qwen were tested with constructed synthetic saved readings, not patient records: invalid medical drafts were withheld, Qwen's structured selection generated successfully, and the final record summary preserved the supplied values and canonical levels. This is not clinical validation. User dotenv, database and model files were not modified.

## Live ingestion and chat health observations (2026-11-15)

- Added a visible English Live Monitoring workspace with manual partial entry, explicitly synthetic browser demo start/stop, authenticated polling, incoming timestamps, durable sample counts/history, server findings and API example. Timers stop on disposal/context changes; in-flight requests may complete. No physical sensor connection is claimed.
- Added protected GET/POST /api/observations with role isolation, numeric/boolean/range/time/source validation and append-only SQLite history. Observations overlay only supplied fields for their exact person/day/mission, ordered by measured time/ID; later full check-ins supersede older observations without erasing history. Existing check-ins, images and unrelated lab freshness are preserved. Public sender metadata does not prove hardware provenance.
- Added conservative deterministic first-person headache extraction for Turkish/English chat. Only the signed-in astronaut selected as subject can receive an automatic report. Negated, hypothetical, quoted, complex and third-person statements are excluded. Voice confirmation and urgent safeguards remain active. Saves precede rebuilding the same request's assessment/context; the frontend displays a separate saved/not-saved receipt. No full transcript history or LLM-generated write instructions are persisted.
- Record context includes at most eight non-superseded observations within seven mission days; other people/missions/future days/images remain excluded. Crew Data overlays and CSV identify saved updates separately from base provenance. Added a jury demo sequence and API/precedence/limitations in docs/LIVE_MONITORING.md.
- Validation: 235 Node/DOM tests and TypeScript passed, including actual HTTP/temporary SQLite persistence, partial/manual/image preservation, timestamp ordering, permissions, self-report grammar, future authorized reviews, confirmed voice/urgent safeguards, visible receipts and stream stop/disposal. Real-browser visual, microphone and hardware checks remain manual.

## NASA-inspired individualized crew scenarios (2026-11-15)

- Added four distinct fictional profiles with shared, reproducible workload/sleep/hydration/environment drivers. Preserved broad source-backed hematocrit/radiation/nutrition themes and existing eye/vein scenarios; individual curves and coupling coefficients remain synthetic/demo, not NASA patient records or causal estimates.
- Added versioned startup seeding of 1,080 snapshots (4 crew × 90 days × 3 missions) in a separate SQLite table using insert-ignore transactions. No existing medical check-ins/notes/messages/settings/models are overwritten. Scheduled sample-hold and measurement-day metadata are preserved; manual entries override only their exact person/day and retain the pre-existing cross-mission key limitation.
- Added authenticated /api/crew-data and the English Crew Data explorer with authorized astronaut/mission/day selection, six time-series charts, eight current metrics, correlation cards/scatter plots and selected-profile CSV. CMO sees all four; crew see themselves; Earth is denied. The full backend connection panel remains Health Check-only; legacy BIS/ring-score examples stay separate and linked to the new explorer.
- Pearson associations are calculated from selected records, with null for constant/short series and visible manual-point counts. Shared time trends, autocorrelation and synthetic causation limitations are explicit. AI record context includes dataset version and latest-30-day associations; reported coefficients are rendered by the server, not the models. Fixed the UI LEO→ISS mission alias.
- Validation: 204 Node/DOM tests and typecheck passed, including all 1,080 generated readings, expected within-person association directions, seed idempotence/preservation, API privacy, attachment exclusion, charts, astronaut selection and CSV export. No real-browser visual/clinical validation or model/voice downloads were performed for this task. See docs/SYNTHETIC_CREW_DATA.md.

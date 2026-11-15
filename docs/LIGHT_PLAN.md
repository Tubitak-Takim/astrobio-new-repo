# Light & Circadian Care

## What this feature does (and does not do)

**New compact cabin indicator:** the page now also displays a mission-shared automatic ambient target based on **Earth UTC** (gradual warm morning, brighter daytime, evening dimming, low night ambience). Personal mission-clock settings remain separate. CMO edits the cabin schedule; no device is connected. Settings, research and history are collapsed to keep the default view small. **Reports** now provides a unified authorized CSV and a simulated Earth queue. [Controller model, telemetry schema, research and demo](CIRCADIAN_TELEMETRY.md).

Open **Light & Circadian Care** in the left navigation. Each fictional astronaut has a mission-specific personal schedule, a calendar of up to seven mission days, reminder acknowledgments, stress self-reports and automatic medical/sleep-plan **review suggestions**.

This is **not a treatment controller**. No hardware is connected; no light is switched on; no dose, irradiance or wavelength is prescribed. Colored UI borders are decorative, not light therapy. A saved reminder acknowledgment is not measured exposure, adherence or evidence of benefit. A CMO research-review request is not clinical approval.

### Scientific corrections

- **Blue light is not a bedtime relaxation treatment.** Blue-containing light during sensitive periods can suppress melatonin and shift circadian timing. The demo instead separates a daytime lighting reminder, a dim warm-toned pre-sleep period and a dark sleep opportunity. Actual timing, intensity and safety need a mission-approved plan.
- **Red light is not presented as proven astronaut cell regeneration or stress treatment.** Photobiomodulation research is condition/device dependent. The red panel supports a request for CMO/research review, and a recurring **discussion appointment**, never an exposure session.
- Sleep and mood changes are nonspecific; they cannot establish a stress diagnosis. The module does not fabricate a sensor-derived stress level from heart rate, sleep or mood. Real use would require qualified assessment, including eye conditions, light sensitivity, photosensitizing medication and relevant mood-disorder history.

Research-theme references (read for this implementation):

1. [NASA, ISS report 12 October 2023: Circadian Light experiment](https://www.nasa.gov/blogs/stationreport/2023/10/12/iss-daily-summary-report-10-12-2023/). Documents an experiment on varied lighting/circadian rhythm, not validation of our calendar.
2. [CDC/NIOSH: light color and circadian rhythms](https://www.cdc.gov/niosh/work-hour-training-for-nurses/longhours/mod2/20.html). Explains blue light, melatonin and sensitivity to timing. Not an astronaut dosing protocol.
3. [American Academy of Dermatology: red-light therapy evidence and precautions](https://www.aad.org/public/cosmetic/safety/red-light-therapy). Describes condition/device-specific dermatology evidence and precautions. Not proof of astronaut regeneration or stress-treatment efficacy.

## Jury demonstration

1. Restart `npm run dev`, refresh and open **Light & Circadian Care**. Sign in as **C1**, PIN `2026`, select Mars and mission day **2**.
2. Show the separate daytime, warm wind-down and dark sleep blocks, and the **Research review only** red panel. Default clocks differ across crew: C1 06:30–22:30, C2 07:00–23:00, C3 07:30–23:30, C4 06:00–22:00. These are invented schedules.
3. Save a different wake/bed pair with a 7–10 hour sleep opportunity. The guard is a demo planning constraint, not a clinical sleep prescription. Times use a **mission-local operational clock**, not the browser's time zone, real sunlight or Mars sols.
4. Enter a fictional self-reported stress score of **8** and save. The page displays **Review suggested — not a treatment order**, the reason, receipt, timestamp and automatic-review history. No device command is sent.
5. Change the score to **2**. If there are no other signals, the prompt returns to routine and history retains the transition. Multiple refreshes/polls do not duplicate the same automatic alert.
6. Request **CMO / research review** for red light. Show the saved request, not a start/approval/completion claim. C2 can select a colleague to inspect this person's requests and schedule, but cannot submit a stress score as if they were that colleague.
7. In Ask to AI, report **“I am tired”** for your own account/day/mission. A saved fatigue report can produce a matching-context link to the lighting/sleep-plan page. Acute chest/breathing reports instead retain urgent handling and link to Health Check. Headache/vision changes take medical-review priority over light suggestions.

The page refreshes server data every five seconds without overwriting unsaved schedule edits. Leaving/changing context/signing out clears that page's timer; an already submitted request may still finish. The calendar does not trigger timed device sessions, OS notifications or a background browser process.

## Transparent review rules

Rules are deterministic **demo heuristics**, not a validated stress classifier:

1. A red canonical finding or a same-day saved chest-pain/breathing-difficulty report → **urgent** medical assessment. No light treatment substitutes for care.
2. Headache or vision change in the selected reading → **caution** and medical discussion before considering changes to exposure.
3. Otherwise, with automatic review enabled, any of these → **review**:
   - latest same-day self-reported stress **≥7/10**;
   - selected reading's seven-day sleep average **<6 hours AND** mood average **≤2.5/5**;
   - a same-day saved **fatigue or sleep-difficulty** report.
4. Otherwise → **routine**, or **disabled** when automatic noncritical review is off. Urgent/caution warnings cannot be disabled with that preference.

The UI identifies synthetic/manual base readings, saved health overlays and the actual timestamp of a self-reported stress score. No missing stress report is treated as a zero. Historical/future-day or other-mission reports do not trigger the selected day's rule. Input histories remain intact; a reminder acknowledgment does not dismiss or clinically resolve an urgent symptom.

## Backend and persistence

New tables in the configured SQLite database:

- `light_preferences`: crew/mission settings, update time and actor; no existing defaults/settings are overwritten.
- `light_stress_reports`: append-only same-day self-reports with actor and timestamp.
- `light_review_alerts`: current rule state per crew/mission/day.
- `light_plan_events`: append-only reminder/research requests and automatic state-transition history.

Rule evaluation is event-driven: successful observation ingestion, chat self-report writes, full check-ins and lighting-module updates evaluate the affected context before returning. A full check-in uses the existing cross-mission key, so its effect is evaluated in all three missions. Reading a lighting plan also reconciles the selected context, including seeded data or later removal of legacy check-ins. There is **no continuously running clinical monitoring daemon**. Automatically changing state is transactionally stored with its history entry; unchanged reads do not duplicate alerts.

Preferences apply only to their crew/mission. All data remain server-filtered: crew see themselves, CMO may view/edit authorized crew schedules and acknowledge/request reviews, Earth has no onboard access. A stress self-report requires the selected astronaut to equal the signed-in account. Existing check-ins, photos, synthetic seed rows, voice/model files and unrelated settings are preserved.

## API

All endpoints require `Authorization: Bearer <token>`. Context is `{crewId,day,mission}` with day 1–90 and mission `iss|moon|mars`. Writes are limited to 30/minute/account.

- `GET /api/light-plan?crewId=C1&day=2&mission=mars`: returns preferences/provenance, calendar, review reasons/metrics, recent selected-day history and evidence/limitations. `simulated:true`, `deviceConnected:false`, `exposureAuthorized:false` remain explicit.
- `PUT /api/light-plan/preferences`: context plus `preferences:{wakeTime:"06:30",bedTime:"22:30",autoReview:true}`. Strict `HH:MM`, boolean and 7–10 hour opportunity validation; additional device/dose settings are rejected.
- `POST /api/light-plan/stress`: context plus integer `score:0..10`; only the signed-in astronaut's self-report.
- `POST /api/light-plan/actions`: context plus `kind`/`action`. `wake_cue|wind_down|sleep|auto_review` support `acknowledged|dismissed`. `red_review` supports **only** `requested`. `started`, `approved`, `completed` and unknown action types are rejected.

Write response: `{persisted:true,receipt:{id,at},plan}`. GET and write plans never grant clinical exposure approval. Observation/chat writes also return a `lightReview` summary for visible context-preserving navigation; they do not feed a treatment command to an LLM.

## Validation limits

Automated tests cover calendar bounds/overnight and shifted clocks, validation, authorization and role isolation, self-report attribution, rule priority, disabled-review safety, persistent/idempotent transitions, event-driven ingestion/chat hooks, research-only actions, UI receipts/calendar, polling disposal and stale-response protection. Tests do not validate clinical efficacy, real hardware, real-browser accessibility/layout or actual circadian effects.

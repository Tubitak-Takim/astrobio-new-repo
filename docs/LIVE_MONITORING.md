# Live monitoring and saved chat self-reports

## Jury demonstration

1. Restart `npm run dev`, refresh the browser, and open **Live Monitoring** from the sidebar. Sign in as **C1** (PIN `2026`); select **Mars**, day **60**. This is a fictional crew scenario, not patient data.
2. Click **Start demo stream**. Point out the **DEMO STREAM RUNNING** label, incoming samples, source, measurement/receipt timestamps, total saved samples and changing server findings. The browser generates synthetic samples every three seconds; the UI polls the authenticated server every two seconds. No physical sensor is connected.
3. Click **Stop stream**. New demo sends stop; monitoring continues. An already in-flight request can still finish. Send a manual heart rate such as **95** with other fields empty. The receipt identifies the persisted sample. Empty fields are unchanged; no new blood test or image is fabricated.
4. Open **Ask to AI**, select **your own C1 account**, Mars/day 60, and send **“Başım ağrıyor”** or **“I have a headache”**. Show the independent **Health record saved** receipt, identifying the astronaut, day, mission and timestamp. Local model failures do not turn the saved observation into an AI diagnosis.
5. Send **“Review my health records”** or **“Sağlık verilerimi analiz et”**. The selected person's bounded context includes saved field updates, along with canonical rule findings and base measurements. If a red finding is present, urgent handling takes priority over the model review.
6. Return to **Live Monitoring** for the same person/day/mission: the `chat_self_report` observation is in the incoming history. **Crew Data** also overlays these fields on the base snapshots and labels the mixed provenance. A full page reload does not erase SQLite records.
7. Optionally sign in as **C2 / CMO** and select a colleague. Saying **“I have a headache”** while viewing that colleague **does not** record it against them. The UI shows a not-saved explanation. Crew accounts cannot read/write colleagues' records; Earth has no onboard ingestion access.

Changing person, mission, day, route, signing out or leaving the page stops that page's demo/polling timers. Reloading does not automatically restart a demo. Demo samples change the saved scenario; use a separate `DB_FILE` for an isolated presentation if required. No real-browser visual, microphone, hardware or clinical validation is claimed by automated tests.

## API

`POST /api/observations`, `Authorization: Bearer <token>`, JSON:

```json
{
  "crewId": "C1",
  "day": 60,
  "mission": "mars",
  "source": "external_api",
  "measuredAt": "2026-11-15T12:00:00.000Z",
  "values": { "restingHrBpm": 82, "spo2Pct": 98 }
}
```

Omit `measuredAt` to use server time. When supplied, it must be within the preceding 24 hours, allowing one minute of future clock skew; the example date must be replaced with a current timestamp. Mission day is a scenario coordinate, separate from wall-clock time.

Allowed public sources: `manual_entry`, `demo_stream`, `external_api`. `external_api` is sender-declared metadata, **not verified hardware provenance**. `chat_self_report` is server-only. Allowed fields and typo-checking ranges:

| Field | Accepted values |
|---|---|
| restingHrBpm | 20–220 |
| spo2Pct | 50–100 |
| bodyTempC | 30–43 |
| systolicBp | 50–260 |
| diastolicBp | 30–160 |
| glucoseMgDl | 20–600 |
| headache | boolean |
| visionChange | boolean (self-reported change, not an ultrasound measurement) |

These are input checks, not medical reference ranges. Unknown fields, empty payloads, strings in numeric fields and unauthorized subjects are rejected. Ingestion is limited to 120 requests/minute/account. Return: HTTP **201**, `{persisted:true,observation:{id,crewId,day,mission,source,measuredAt,receivedAt,values}}`.

`GET /api/observations?crewId=C1&day=60&mission=mars` returns `{observations,total,serverTime}`; latest 50 for the exact context, newest measurement timestamp first (ID breaks ties). No token is included in URLs or shown by the live panel. Use the normal login/session flow. The shared demo PIN is not production-grade device authentication.

## Storage and precedence

`health_observations` is an append-only API history in SQLite, separate from `checkins` and the versioned synthetic seed. All submitted fields are validated before the single insert. Records contain actor, source, server receipt time and measurement time; no full conversation transcript is stored.

Readings begin with the existing synthetic scheduled feed or exact-day full manual check-in. Observations overlay **only supplied fields**, for their exact person/day/mission, sorted by measurement time then ID. Out-of-order arrivals do not replace a newer field measurement. A later full manual check-in supersedes observations measured at or before that check-in; the observation history remains available through the API. Original images and unrelated fields are not modified. Partial updates do not refresh held laboratory measurements. Existing full check-ins remain person/day keyed across missions; observations are mission-specific. Older symptoms remain historical context, not automatically carried-forward current symptoms.

No observation update/delete API is provided in this prototype. A new explicit manual `headache:false` sample can correct the current value without erasing its history. Deleting legacy check-ins does not delete the separate observation history.

## Conservative chat writes and context

Automatic extraction is deterministic, not an LLM write tool. It supports **16 symptom categories** in Turkish and English:

| ID | Turkish example | English example |
|---|---|---|
| headache | Başım ağrıyor | I have a headache |
| dizziness | Başım dönüyor | I feel dizzy |
| nausea | Midem bulanıyor | I feel nauseous |
| vomiting | Kusuyorum | I am vomiting |
| fatigue | Çok yorgunum | I feel very tired |
| insomnia | Uyuyamıyorum | I cannot sleep |
| abdominal_pain | Karnım ağrıyor | My stomach hurts |
| back_pain | Sırtım ağrıyor | I have back pain |
| chest_pain | Göğsüm ağrıyor | I have chest pain |
| shortness_of_breath | Nefesim daralıyor | I am short of breath |
| palpitations | Çarpıntım var | My heart is racing |
| cough | Öksürüyorum | I have a cough |
| sore_throat | Boğazım ağrıyor | My throat hurts |
| feverish | Ateşim var | I feel feverish |
| vision_change | Bulanık görüyorum | My vision is blurry |
| diarrhea | İshalim var | I have diarrhea |

Explicit multi-symptom reports also work: **“Başım dönüyor ve midem bulanıyor”**, **“I feel dizzy and nauseous”**, or **“I have dizziness and nausea”**. Every clause must match an explicit supported self-report; an unknown/negated/third-party clause prevents the entire message from being auto-recorded. Duplicates are removed and at most eight clauses are parsed. Complex narratives, arbitrary diagnoses and other unsupported symptoms are deliberately not inferred; the not-saved receipt makes this visible.

`symptoms` contains validated category IDs, not diagnoses or estimated vitals. Feverishness does not generate a temperature, palpitations do not generate a heart rate, fatigue does not generate a mood score. Headache and vision change additionally set their existing reported boolean fields; they do not refresh lab/ultrasound measurements. Chest pain and breathing difficulty trigger the urgent response without model generation, while the authorized self-report is still saved first.

The ingestion API also accepts `symptoms:["dizziness","nausea"]` with optional `values` (which may be empty). Unknown/duplicate IDs, non-array lists, more than 16 categories, and conflicting `headache:false`/`visionChange:false` fields are rejected. Existing observation tables are migrated additively with `symptoms_json` defaulting to `[]`; old readings and reports remain intact. The live history, chat receipts, Crew Data recent records and CSV expose these reports separately from numeric readings.

Negation, hypothetical questions, quotations, mixed/complex statements and third-person reports do not match. A clinician merely selecting another astronaut is not sufficient to attribute a first-person report to that astronaut. The selected person must equal the authenticated account. Voice reports require the existing reviewed-transcript confirmation before any write. Urgent rules remain in force; extraction is not clinical triage.

Saving occurs after request validation/authorization/rate checks and **before rebuilding that request's assessment/context**. `/api/chat` returns `persisted:true` only for a saved structured observation, plus `healthRecord:{status,reason,observation}`. Otherwise `persisted:false` and a not-saved explanation are shown. The complete chat text/history is not persisted. If a network request fails, the client cannot know whether the write completed: inspect incoming observations before resending.

Explicit record reviews and newly saved self-reports can include authorized context; other ordinary chat does not. Context includes up to **eight health updates within seven mission days**, prioritizing symptom reports over a high-frequency vital stream. Never future days, other people, other missions, images or arbitrary transcript text. A newer full check-in supersedes older numeric/boolean overlays, but saved symptoms remain historical reports with their original timestamps, not newly measured current conditions. Base `origin` remains `database_checkin`/`simulated_feed`; saved partial updates are identified separately. Model summaries remain server-grounded, bounded, experimental and non-diagnostic. Chest/breathing reports receive immediate urgent handling, not an inferred permanent diagnosis or automatic symptom resolution.

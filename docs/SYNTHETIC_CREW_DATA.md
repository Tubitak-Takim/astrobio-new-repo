# NASA-inspired synthetic crew dataset

## Purpose and provenance

`crew-scenarios-v1` provides four **fictional** astronaut profiles over **90 mission days**, for ISS/LEO, Moon-surface and Mars-transit settings: **1,080 snapshots**. It is not a NASA medical dataset, actual astronaut records, a clinical prediction model or a clinically validated training/evaluation corpus.

The pre-flight hematocrit/lab reference, white-cell and lymphocyte baselines retained from the existing project reference public NASA OSDR OSD-569 material. Broad hematocrit, radiation, sleep/environment and nutrition themes reference `src/data/sources.ts`; verified/partial/demo source status remains visible. Names, individual trajectories, workload waves, sensitivity, symptoms, coupling coefficients and scenario timing are invented. Published research does not establish these generated correlations.

## Profiles

| ID | Fictional astronaut | Programmed scenario |
|---|---|---|
| C1 | E. Vance, commander | Command workload and hydration gaps; sleep, heart rate and urine output share programmed drivers; the personal pre-flight eye baseline is retained. |
| C2 | M. Chen, crew medical officer | Stable early mission followed by late fatigue, lower sleep/mood and reduced exercise. |
| C3 | S. Jenkins, science specialist | Fictional sensitivity to shared cabin CO₂: later headache, shorter sleep and fewer exercise sessions. SpO₂ is not artificially converted from CO₂. |
| C4 | A. Rivera, flight engineer | Lower initial heart rate, later energy deficit/body-mass loss and reduced exercise; the neck-vein scenario remains separate. |

Radiation and cabin CO₂ are **shared environmental exposures**, not unrelated random values per person. Mission fluid-shift parameters affect relevant findings. Day/person variation is deterministic; reloads do not generate a new patient. Sleep/mood fields are synthetic smoothed state estimates representing seven-day averages, not reconstructed raw nightly logs.

## Storage and preservation

The server creates `synthetic_crew_readings(version, mission, crew_id, day, reading)` at startup in the configured SQLite database. Inserts use `INSERT OR IGNORE` in a transaction. Existing check-ins, notes, messages, sessions, images, dotenv and models are not overwritten. Rows of the same dataset version are retained; change the version for a new release rather than silently rewriting a dataset.

Snapshots honor existing feed schedules: lab/body-mass values are held between measurement days. Seeds are **not** inserted into `checkins`, which would falsely mark every lab as fresh. A manual check-in overrides only that person/day in the explorer, marked orange and `manual_checkin`; it does not alter the seed or carry forward. Do not edit the derived seed table directly; use authorized check-ins.

Cards/tooltips distinguish snapshot day from measurement day; CSV exports measurement-day columns for held samples. Existing check-ins are keyed by person/day, **not mission**, so a manual entry is shared across mission views rather than becoming three independent records. Mission changes affect synthetic radiation/fluid-shift assumptions, not a previously saved manual measurement.

## View the data

1. Run/restart `npm run dev`; open **Crew Data** in the sidebar or the Main Panel's **Open Crew Data** link.
2. Sign in with PIN **2026**. **C2 / M. Chen** can select all four astronauts; other crew accounts see only themselves. Earth cannot access onboard time series.
3. Select mission and day 1–90. Day **90** shows the full mission, including late scenarios; default day 60 stops at day 60.
4. Inspect six time series, scatter plots, source status and recent records; download the selected profile/window as CSV.

The authorized backend connection panel remains **only in Interactive Health Check**. Crew Data is a dedicated explorer, not another copy of that panel. Old A-01/BIS/Cole/ring-score design pages remain independent, labeled visual examples. No BIS values were fabricated from backend measurements. Existing browser demo imports are preserved and not mixed into the authorized dataset.

## Associations and limits

The server computes Pearson r for sleep–heart rate, sleep–mood, urine–heart rate, CO₂–headache, exercise–body mass and mission day–vitamin D. Headache is coded 0/1 (point-biserial). Coefficients are `null` / N/A with fewer than eight observations or a constant series. Eight is a **demo reporting minimum**, not a guarantee of statistical reliability.

These are descriptive within-person associations, not pooled effects. Shared time trends, autocorrelation, programmed drivers and held samples can create strong coefficients. Ninety daily snapshots do not mean ninety independent lab specimens. No p-values, causal claims, disease probabilities or clinical performance scores are produced. Manual entries can change results; their count is displayed.

## API and AI

`GET /api/crew-data?day=90&mission=mars&window=90` requires authentication and returns only authorized crew. Day/window are 1–90; mission is `iss`, `moon` or `mars` (UI LEO maps to `iss`). Responses include version, limitations, fictional profiles, origin, time series and computed associations. Photos, notes and messages are not exported.

AI record review uses the same generated-reading/manual-override logic. Its bounded selected-person context includes dataset version and associations over the **latest 30 mission days**, explicitly synthetic/mixed and non-causal. This differs from the explorer's window of up to 90 days. Reported coefficients/counts are rendered by the server, not invented by a model. Previous saved check-ins remain separate; simulation is never relabeled as a saved personal check-in.

## Validation

Tests cover all 1,080 readings, deterministic/different profiles, input ranges, programmed association directions, constant/short-series handling, SQLite idempotence, manual overrides, role isolation, image exclusion, chart rendering, astronaut selection, LEO mapping and selected-profile CSV. These checks do not establish medical validity. Real-browser visual/accessibility validation remains manual.

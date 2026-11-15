# Call Me Agro — Backend MVP Development Checklist

> This is a progress log and roadmap, **not permission to code**. Codex must inspect, propose one narrowly scoped task, and wait for `ابدأ` before changing anything. Mark `[x]` only after actual verification and record the evidence below. Do not copy frontend completion claims into this file.

## Milestone 0 — Inspect and bootstrap (CURRENT PRIORITY)
- [ ] Inspect actual `backend/` structure, `pom.xml`, `src/`, configs, Maven wrapper, and Git status (read-only).
- [ ] Verify Spring Boot, Java, Maven versions and generated package name; do not assume they match the proposed setup.
- [ ] Confirm Spring Web, Validation, Lombok, Spring Data JPA, and **MS SQL Server Driver** are present or explicitly identify omissions. **Do not add MapStruct**.
- [ ] Agree local SQL Server connection details and safe environment-variable configuration (no credentials in Git).
- [ ] Verify initial build/test and run the backend only when permitted and configured safely. Record exact commands/results.
- [ ] Confirm that the frontend and backend are sibling projects and neither build overwrites the other.

## Milestone 1 — API planning and basic server
- [ ] Inspect current Angular models, saved plan fields, crop IDs, routes, and `localStorage` format (read-only).
- [ ] Agree initial endpoint(s), DTO shape, date format, JSON error format, and status codes before implementation.
- [ ] Implement a minimal server/health check **only if approved**; test response from local environment.
- [ ] Add approved validation and error handling without creating unnecessary infrastructure.
- [ ] Configure CORS for the verified Angular development origin **when browser integration is approved**.

## Milestone 2 — SQL Server persistence (after contract approval)
- [ ] Confirm local database exists or get explicit permission to create a dedicated development database.
- [ ] Configure Spring Boot datasource with environment variables and safe schema strategy; no embedded credentials.
- [ ] Agree minimum plan entity schema from actual frontend model, including ID, journey, dates, crop, and status.
- [ ] Implement plan repository/service and approved create/read endpoints in small steps.
- [ ] Validate farm values, real calendar dates, allowed crop IDs, and exactly one selected final crop for Planning to Plant.
- [ ] Handle Already Planted separately (current crop and planting date), without requiring comparison results.
- [ ] Test invalid records, unknown IDs, duplicate submissions, and retry behavior; prevent accidental duplicate plans.
- [ ] Verify persistence by creating/retrieving a plan **in a safe local test/dev database**.

## Milestone 3 — NASA weather integration
- [ ] Identify the actual NASA POWER endpoint/parameters for selected Pakistan farm coordinates and dates.
- [ ] Verify units, returned field names, historical range, missing/sentinel values, and error responses from a real sample request.
- [ ] Agree weather response DTO and which data the frontend actually needs.
- [ ] Implement a minimal NASA client with timeouts and explicit error handling only after approval.
- [ ] Test network failure, empty/malformed data, invalid coordinates, and reproducible sample data.
- [ ] Label old one-location CSV coverage accurately; do not substitute it for arbitrary farm locations.

## Milestone 4 — Non-AI crop rules and recommendations
- [ ] Decide which real inputs are available: current/previous crop, farm location, planting season, weather, soil, irrigation.
- [ ] Review trustworthy agronomic guidance for supported crops and Pakistan growing conditions.
- [ ] Define an explicit **rule-based** suitability/rotation formula and assumptions; **no AI or ML**.
- [ ] Decide how to handle missing soil/irrigation/history instead of pretending those factors were assessed.
- [ ] Review historical `crop_rotation_recommendations.csv` only as **unverified demo output**, never as validated scoring ground truth.
- [ ] Implement deterministic calculation in a service independent of web and persistence layers.
- [ ] Unit-test crop ordering, prior-crop effects, seasonal boundaries, ties, missing data, and score limits.
- [ ] Expose recommendations through a contract agreed with Angular; return sources/assumptions and DEMO flag where applicable.
- [ ] Never present unvalidated scores as verified agricultural advice.

## Milestone 5 — Frontend integration (separate permission)
- [ ] Agree whether the backend or existing `localStorage` is authoritative for plans during the transition.
- [ ] Define a safe migration strategy for existing saved plans, including duplicate IDs and failure recovery.
- [ ] Connect one approved Angular flow to its matching API without changing other screens.
- [ ] Preserve Planning to Plant and Already Planted data and stable plan IDs across back/forward/refresh.
- [ ] Verify My Plans opens the correct record and Dashboard displays the correct selected crop.
- [ ] Replace MOCK suitability only when actual rule inputs/calculations are verified; otherwise keep clear demo labeling.

## Milestone 6 — Quality and end-to-end
- [ ] Run approved Maven tests/build and record pass/fail with relevant versions.
- [ ] Test APIs with valid, invalid, missing, duplicate, and conflicting data.
- [ ] Validate SQL Server failure/reconnect behavior and safe data handling.
- [ ] Verify NASA API failure and slow-response behavior if integrated.
- [ ] Check frontend/backend origin integration only after CORS is approved.
- [ ] End-to-end: Planning to Plant → one selected crop → confirm → saved plan → dashboard.
- [ ] End-to-end: Already Planted → planting date/current crop → saved plan → dashboard.
- [ ] Verify no invented crop scores, no unauthorized AI, no leaked credentials, and no unrelated frontend edits.

## Explicitly out of scope unless approved
- Authentication, accounts, Spring Security, JWT.
- AI, ML training, AI-based recommendations.
- MapStruct or additional frameworks added for convenience.
- Production deployment, paid infrastructure, and automatic destructive schema generation.
- Unrequested issue-management, crop-diagnosis, or fertilizer endpoints.

## Verification log

### 2026-11-15 - Preliminary crop air-temperature comparison

- Approval: implement POST crop-suitability only with approved references, preserve all temperature evidence counts and crop order, explicitly limit classifications to preliminary planting-start-window air-temperature comparisons; no frontend/database/AI changes.
- Added `controller/CropSuitabilityController.java`, `dto/CropSuitabilityRequest.java`, `dto/CropSuitabilityResponse.java`, `service/CropClimateRules.java`, `service/CropSuitabilityService.java`, controller/service tests and `docs/crop-climate-rules.md`. Modified `PlantingClimateService` and its tests to share daily and summary data from a single NASA call; modified `ClimateExceptionHandler` for JSON/body validation errors.
- Endpoint: `POST /api/crop-suitability` with latitude, longitude, plantingWindow.from/to and comparisonCrops. Supports exact lowercase potato/tomato/onion/pepper/cucumber/carrot IDs, preserves input order; rejects duplicates/unknown IDs, missing fields, invalid coordinates/dates and non-increasing windows. Existing historical/date limits and 422/502/504 semantics retained.
- Rules version `air-temperature-reference-v1`: potato 18-20 C (FAO/BAMIS), tomato 60-80 F, pepper 70-80 F, cucumber 75-85 F, carrot 60-65 F (OSU), onion 55-75 F (UCCE). Exact conversion before comparison; inclusive bounds. References and per-crop range basis returned in response and documented. This algorithm is an approved engineering comparison, not a validated establishment/yield model.
- Every crop includes preliminary label, scoped explanation, actual historical period and valid/missing/below/within/above day counts. Missing temperature produces limited/insufficient evidence; missing rainfall does not suppress available temperature evidence. No scores, fitness ranking, crop selection, water adequacy or disease judgments. Historical data are not forecasts.
- Existing IntelliJ Maven, JDK 17.0.12, `mvn.cmd test -B`: BUILD SUCCESS; 96 tests, zero failures/errors/skips. Counts: application 1, climate controller 32, crop controller 11, climate summary 6, crop service 18, NASA service 7, planting service 21. Tested all six exact ranges/bounds, conversion, input order, one NASA call, partial/no temperature, absent rainfall, leap-year metadata, invalid JSON/dates/IDs/coordinates, and upstream error propagation; all earlier tests still pass.
- Started local server using `mvn.cmd spring-boot:run -B -Dspring-boot.run.arguments="--server.port=18080 --server.address=127.0.0.1"`. Real POST for 31.5204/74.3587, requested 2027-11-01 to 2028-02-29, crop order carrot/pepper/potato/cucumber/onion/tomato: HTTP 200; HISTORICAL_ESTIMATE, isForecast false, actual 2023-11-01 to 2024-02-29, 121 days. Independently fetched NASA T2M for actual period and matched every evidence count.
- Live evidence below/within/above (all 121 valid, zero missing): carrot 78/24/19; pepper 112/9/0; potato 102/10/9; cucumber 121/0/0; onion 38/83/0; tomato 78/43/0. Cucumber was Preliminary: Cooler than reference; other crops Preliminary: Variable temperatures. These are reference comparisons only.
- Regression live calls: daily, annual summary and planting summary all HTTP 200. Daily remains 365 days, first T2M 12.96 C; annual average remains 25.01145205479452 C; 2025-01-01 to 2025-01-02 planting average remains 14.15 C. Live unknown crop request returned 400.
- No Angular, database, dependencies, authentication, AI or existing API contract changes. Agronomic validity beyond documented preliminary scope remains unverified by design. Git status remains unavailable due to parent `.git` read failure.
- Next proposed task, not started: inspect and propose Angular HTTP integration and honest non-mock copy for existing Recommendations layout, with scoped frontend approval.

### 2026-11-15 - Planting Climate Summary

- Approval: planting-period summary only, strict leap-year/date-count preservation, historical estimates for periods including current UTC day or future, actual source period metadata, existing endpoints retained.
- Added `dto/PlantingClimateResponse.java`, `service/PlantingClimateService.java` and its service tests. Modified `ClimateController`, `NasaPowerService`, `ClimateSummaryService`, their controller/NASA tests, and `ClimateExceptionHandler` for date-specific 400 messages. No dependency/config/frontend/database/AI/recommendation changes.
- Endpoint: `GET /api/climate/planting-summary?latitude=31.5204&longitude=74.3587&startDate=2027-11-01&endDate=2028-02-29`. Both dates required, inclusive ISO calendar dates, 1-366 days, start on/after 1981-01-01. Invalid input 400; unavailable comparable period 422; NASA failures/timeouts retain 502/504.
- Past periods ending before current UTC day use HISTORICAL_DATA directly. All others use HISTORICAL_ESTIMATE: latest calendar-matching period ending by December 31 of prior year, both endpoints shifted by same year offset, identical inclusive day count, no Feb 29 clamping. One NASA request, no fallback/retries. This is one historical analogue, not a forecast or multi-year climate normal.
- Metadata: requestedPeriod/requestedDays/dataMode/isForecast=false/method; summary.period contains actual historical start/end years. Existing summary calculations, missing-data statuses and partial-rain semantics reused. Requested dates are method arguments, never mutable shared configuration.
- `mvn.cmd test -B` with existing IntelliJ Maven/JDK 17.0.12 passed 66 tests, zero failures/errors/skips: 32 controller, 20 planting service, 7 NASA, 6 summary, 1 application context. Covered current day, mixed past/future, cross-year, Feb 29, internal leap-day count, non-leap century 2100, 366-day boundary, invalid calendar dates, no historical match, missing rainfall, HTTP failures, and existing regressions. Final run passed after replacing deprecated HTTP 422 constant.
- Started local server with `mvn.cmd spring-boot:run -B -Dspring-boot.run.arguments="--server.port=18080 --server.address=127.0.0.1"`. Real NASA-backed future example returned requested 2027-11-01 to 2028-02-29, actual 2023-11-01 to 2024-02-29, both 121 days, HISTORICAL_ESTIMATE, isForecast false, COMPLETE.
- Independent direct NASA request for that actual period matched all six statistics within 1e-8: average temperature 14.918760330578513 C, min/max daily mean 10.2/22.86 C, rain 51.78 mm, average humidity 55.41074380165289 %, average radiation 10.591404958677685 MJ/m^2/day.
- Real historical request 2025-01-01 to 2025-01-02 returned HISTORICAL_DATA, 2 days, mean temperature 14.15 C. Invalid 2025-02-29 returned HTTP 400.
- Real current UTC day request (2026-11-14 at execution; Cairo local date 2026-11-15) mapped to 2025-11-14, one day, HISTORICAL_ESTIMATE, isForecast false.
- Both original endpoints returned HTTP 200: daily 365 days starting 2025-01-01 with temperature 12.96 C; annual summary mean temperature still 25.01145205479452 C.
- No known functional blockers; Git state remains unverified due to parent repository access limitation. Next proposed task, not started: inspect Angular planting-date contract and origin before proposing integration.

### 2026-11-15 - Climate Summary API

- Approval: summary endpoint only; reuse NASA service, clarify T2M extrema and available-day precipitation totals; preserve daily endpoint; no frontend/database/recommendations.
- Added `dto/ClimateSummaryResponse.java`, `service/ClimateSummaryService.java`, and `service/ClimateSummaryServiceTests.java` under the existing main/test packages. Modified `controller/ClimateController.java` and its tests to add summary and share unchanged coordinate validation. NASA client, daily DTO, dependencies and configuration unchanged.
- Endpoint: `GET /api/climate/summary?latitude=31.5204&longitude=74.3587`. Calls the existing NASA service once. Same configurable 2025 default period and upstream failure semantics.
- Temperature average/minimumTemperature/maximumTemperature describe daily mean T2M values; response includes explicit basis. Rain totalPrecipitation sums available days only, with basis, validDays and completePeriod. Total unit is mm, unsupported incoming rainfall units return 502. Each parameter excludes null independently; no valid observations returns null, not zero. No intermediate rounding.
- Existing IntelliJ Maven with JDK 17.0.12: `mvn.cmd test -B` passed 33 tests, zero failures/errors/skips (20 controller, 6 summary, 6 NASA, 1 context). Includes known aggregates, negative temperature, zero rain, independently missing values, all missing, unsupported rain units, validation and upstream errors; all prior daily tests pass.
- Ran `mvn.cmd spring-boot:run -B -Dspring-boot.run.arguments="--server.port=18080 --server.address=127.0.0.1"`. Real NASA-backed summary and daily requests both returned HTTP 200 for 2025-01-01 through 2025-12-31. Daily still returned 365 days and first-day temperature 12.96 C. Invalid summary latitude 91 returned 400.
- Independently calculated all six summary indicators from daily JSON using PowerShell Measure-Object; all matched within 1e-8. COMPLETE, all validDays 365: average temperature 25.01145205479452 C, min/max daily mean 10.91/41.61 C, total rain 1186.35 mm, average humidity 51.315205479452054 %, average solar radiation 16.826246575342466 MJ/m^2/day.
- No known functional blockers. Git state remains unverified due to parent repository access limitation recorded above. No Angular, database, crop recommendation or AI changes.
- Next proposed task, not started: inspect Angular climate contract and development origin before proposing frontend integration.

### 2026-11-15 - NASA Climate API

- Approval: NASA climate endpoint only, retaining dependencies, temporary database-free startup, configurable default 2025 period, explicit successful no-data response.
- Added `controller/ClimateController.java`, `service/NasaPowerService.java`, `dto/ClimateResponse.java`, `exception/ClimateExceptionHandler.java`, and controller/service tests under the existing package.
- Modified `src/main/resources/application.properties`: temporary JDBC/JPA auto-configuration exclusions; NASA URL, 2025 start/end, 5-second connect timeout, 30-second read timeout.
- `pom.xml` unchanged: JPA retained. SQL Server driver was already absent; no dependency removed or added.
- Endpoint: `GET /api/climate?latitude=31.5204&longitude=74.3587`. Daily temperature, precipitation, relative humidity, solar radiation; units from NASA metadata, period, UTC, source and data status.
- Missing values become null. HTTP 200 statuses: COMPLETE, PARTIAL, NO_VALID_DATA. Invalid input: 400; upstream HTTP/network/malformed-response failure: 502; timeout: 504. Missing climate data never uses 404.
- Maven wrapper failed in this shell. Existing IntelliJ-bundled Maven with JDK 17.0.12: `mvn.cmd test -B` passed 17 tests, zero failures/errors/skips. Tested database-free context startup, validation, JSON, missing/sentinel values, upstream HTTP failures, malformed responses and read timeout.
- Ran `mvn.cmd spring-boot:run -B -Dspring-boot.run.arguments="--server.port=18080 --server.address=127.0.0.1"`. Called actual local endpoint using PowerShell: HTTP 200, 2025-01-01 through 2025-12-31, 365 days, COMPLETE, no missing values. Latitude 91 returned HTTP 400.
- Live first day: temperature 12.96 C, precipitation 0.0 mm/day, humidity 43.79 %, radiation 6.8 MJ/m^2/day. Last returned date: 2025-12-31. Independent direct NASA two-day request matched first-day values/units.
- Maven/NASA network access required sandbox escalation and succeeded. Git status unverified: invoking Git by its absolute path failed to read the parent repository's `.git`. No frontend, database, CSV, authentication or recommendation changes.
- Custom dates currently configurable through `nasa.power.start` / `nasa.power.end`, up to one year; request date parameters not implemented.
- Next proposed task, not started: inspect Angular climate contract and development origin before proposing integration/CORS.
Add a new entry **only after work was actually performed**:

```text
Date:
Task and approval:
Files changed:
Commands/tests actually run + results:
API response / database evidence:
Remaining issues or limitations:
Next proposed task (not started):
```

## Current handoff
- Developer has generated and opened a Spring Boot + Maven backend project and selected SQL Server instead of PostgreSQL.
- Dependency selections were discussed; **actual `pom.xml` and database connectivity have not been inspected here**.
- Existing frontend work is tracked separately in its own checklist.
- **Next Codex action:** read-only inspection of the backend project's real files, then propose exactly one first setup/verification task and wait for `ابدأ`.

### 2026-11-15 - Final backend readiness before Angular integration

- Authorization: final readiness checks and fixes limited to confirmed integration blockers; no agricultural rule or frontend changes.
- Inspected backend instructions, checklist, Maven/config/source and Angular package/angular.json, PlanDraftService and RecommendationsComponent. Angular uses ng serve (default http://localhost:4200), six matching lowercase crop IDs, numeric coordinates and from/to calendar-date fields. Recommendations still use MOCK_COMPARISON; wiring the frontend is a separate task.
- Real POST http://127.0.0.1:18080/api/crop-suitability: Lahore 31.5204/74.3587, future 2027-11-01 to 2028-02-29, crops carrot/pepper/potato/cucumber/onion/tomato. HTTP 200; exact input order preserved, all response fields and preliminary labels present. HISTORICAL_ESTIMATE, isForecast=false, requested 121 days, actual source period 2023-11-01 to 2024-02-29, COMPLETE, no missing values.
- Independent live NASA POWER request for actual period matched all crop below/within/above counts: carrot 78/24/19; pepper 112/9/0; potato 102/10/9; cucumber 121/0/0; onion 38/83/0; tomato 78/43/0. Mean T2M matched 14.918760330578513 C within 1e-8. Cucumber Preliminary: Cooler than reference; others Preliminary: Variable temperatures. Assessment scope PLANTING_WINDOW_AIR_TEMPERATURE, rules air-temperature-reference-v1, explicit limitations retained.
- Confirmed blocker: initial preflight lacked Access-Control-Allow-Origin. Modified controller/CropSuitabilityController.java with endpoint-only CrossOrigin for http://localhost:4200. Added regression checks in BackendApplicationTests.java and controller/CropSuitabilityControllerTests.java. No scoring, dependencies, database or frontend changes.
- Live after restart: allowed-origin preflight 200, Allow-Origin http://localhost:4200, Allow-Methods POST, Allow-Headers content-type; real JSON POST 200 with same origin header and same successful six-crop result. Unapproved origin returned 403. Invalid POST returned 400 application/problem+json with readable validation errors and correct origin header.
- Seven live invalid cases returned 400: missing fields, malformed JSON, out-of-range latitude, unknown crop, duplicate crop, invalid calendar date, reversed dates. Automated tests also verify 422/502/504 propagation, NASA HTTP/malformed failures, timeout, missing data and date boundaries.
- Existing IntelliJ Maven: mvn.cmd test -B, Java 21.0.13 compiling release 17: final BUILD SUCCESS, 98 tests, zero failures/errors/skips. Initial 96 tests passed; added standalone preflight test initially failed due to missing test HandlerAdapter and was moved to full application context, which passes. Auto-review rejected clean test because it deletes target; used test -B successfully without deletion.
- Runtime command: mvn.cmd spring-boot:run -B -Dspring-boot.run.arguments="--server.port=18080 --server.address=127.0.0.1". Test server stopped after checks. Default application port remains 8080.
- Result: READY FOR INTEGRATION for local Angular http://localhost:4200 and POST /api/crop-suitability, preserving preliminary assessment scope. Angular end-to-end wiring not performed. Git status unavailable: parent repository .git access denied. No known remaining backend integration blockers for this scope.
- Next proposed task, not started: approved Angular HTTP wiring and display of historical/preliminary labels with existing plan storage preserved.

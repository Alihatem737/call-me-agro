# Live backend verification — 2026-11-19

Result: **blocked for live raster verification by missing Earthdata credentials**. Public NASA discovery and CORS passed. No successful raster processing is claimed.

Spring Boot 4.0.9 started with Java 17.0.12 on `http://localhost:8080`, bound to `127.0.0.1`. The launch process checked only whether `EARTHDATA_TOKEN` was nonblank; it was absent. Process, User and Machine environment checks also returned false. Configuration maps `satellite.earthdata-token=${EARTHDATA_TOKEN:}`. Actual analysis responses confirm that the running service has no configured token. No credential value was printed or saved.

## Real requests

All requests used the polygon `[[[74.35,31.51],[74.354,31.51],[74.354,31.514],[74.35,31.514],[74.35,31.51]]]`, longitude/latitude, and `Origin: http://localhost:4200`. Area returned by the backend: 168398.55850557357 m².

| Request | Actual result |
| --- | --- |
| POST `/api/satellite/available-dates`, NDVI, 2025-06-01 through 2025-06-10 | HTTP 200, AVAILABLE, three real NASA observations |
| POST `/api/satellite/available-dates`, NDMI, same range | HTTP 200, AVAILABLE, same three observations |
| POST `/api/satellite/field-analysis`, NDVI, 2025-06-10 | HTTP 503, EARTHDATA_NOT_CONFIGURED |
| POST `/api/satellite/field-analysis`, NDMI, 2025-06-10 | HTTP 503, EARTHDATA_NOT_CONFIGURED |
| POST `/api/satellite/vegetation-history`, NDVI, 2025-06-01 through 2025-06-10 | HTTP 503, EARTHDATA_NOT_CONFIGURED |

NASA observations returned by both discovery requests:

| ID | Date | Tile cloud cover |
| --- | --- | --- |
| HLS-VI.S30.T43RDQ.2025153T054251.v2.0 | 2025-06-02 | 10% |
| HLS-VI.L30.T43RDQ.2025155T053603.v2.0 | 2025-06-04 | 2% |
| HLS-VI.S30.T43RDQ.2025161T053701.v2.0 | 2025-06-10 | 0% |

The June 10 observation is a candidate for usable imagery; tile cloud cover alone cannot establish usable field pixels. Discovery correctly returns QUALITY_NOT_EVALUATED with null statistics and layer. Initial verification-script requests accidentally flattened the polygon nesting and received HTTP 400 INVALID_REQUEST. The script was corrected and all requests above were repeated with valid GeoJSON. An initial analysis date of June 6 had no observations; it was replaced with the actual catalog date June 10. Empty-date responses were not counted as raster-processing success.

Actual NDVI/NDMI analysis error body:

```json
{
  "detail": "Configure a server-side Earthdata bearer token to read protected HLS assets.",
  "instance": "/api/satellite/field-analysis",
  "status": 503,
  "title": "Service Unavailable",
  "code": "EARTHDATA_NOT_CONFIGURED"
}
```

History returned the identical detail/status/code, with instance `/api/satellite/vegetation-history`. These match `satellite-monitoring-api.md`. Available-date envelope field names, units, resolution, dates, quality-not-evaluated states and null statistics/layers were checked programmatically against the documented contract. Runtime statistics and nonempty map schemas remain unverified with real imagery.

## CORS and automated tests

All three OPTIONS requests returned HTTP 200 with `Access-Control-Allow-Origin: http://localhost:4200`, `Access-Control-Allow-Methods: POST`, and `Access-Control-Allow-Headers: content-type`. Actual HTTP 200 and HTTP 503 POST responses also included the approved origin header. Preflight from `https://unapproved.example` returned HTTP 403.

Full backend `mvn.cmd test -B` completed successfully using the existing IntelliJ Maven and Java 17.0.12: **142 tests, zero failures, errors or skips**. This includes existing NASA POWER tests and satellite fixture tests. Automated fixture tests are not evidence of live NASA raster success.

Credential-free request/response evidence is saved under `target/satellite-live-verification/`; the repeatable local verification script is `target/verify-satellite-live.ps1`. No Angular or backend production source files were modified in this verification.

## Exact blocker and next action

Set a valid `EARTHDATA_TOKEN` in the environment inherited by Spring Boot, then restart the backend. If the token exists only in an IntelliJ run configuration, it is not inherited by an independently launched Maven process. Do not paste the token into chat or commit it. A missing credential cannot be repaired by changing raster processing code or fabricating results.

After credentialed restart, repeat June 10 NDVI and NDMI analysis and history. Verify protected downloads, valid-pixel counts, Fmask rejection counts, GeoJSON coordinate order/containment and 30 m cell size; recompute returned statistics independently from the downloaded raster windows. Those checks have **not passed live** in this run because processing stops before asset download. The server remains running on port 8080 for local integration.

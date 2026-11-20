# Satellite Field Monitoring API

This extends V1 without changing NASA POWER, crop suitability, database configuration, or Angular files. Java 17 and Spring Boot 4.0.9 are retained. JTS 1.20.0 validates polygons and handles containment; Proj4J 1.3.0 transforms WGS84/UTM coordinates. JDK ImageIO reads georeferenced GeoTIFF windows. No Python, GDAL executable, new database, or application authentication is required.

NDVI describes spectral greenness; NDMI describes vegetation moisture response. Neither is a confirmed disease diagnosis, a yield estimate, or a prescription. Negative and low values are not automatically diseases. No mock observations, interpolated observations, nearest-date substitution, or fallback weather values are returned.

## NASA sources verified

- [NASA HLS access mechanisms](https://hls.gsfc.nasa.gov/data-access-and-tools/): Earthdata Cloud COG files, Earthdata Login for protected downloads.
- [HLS-VI v2 product guide](https://lpdaac.usgs.gov/documents/2088/HLS_VI_User_Guide_V2.pdf): NDVI/NDMI int16, scale 0.0001, dimensionless, valid range -1 to 1, 30 m; source granule times are identifiers, not exact field overpass times.
- [HLS v2 quality guide](https://lpdaac.usgs.gov/documents/1698/HLS_User_Guide_V2.pdf): Fmask bit fields and fill 255.
- [CMR LPCLOUD STAC catalog](https://cmr.earthdata.nasa.gov/stac/LPCLOUD): collections `HLSL30_VI_2.0` (Landsat) and `HLSS30_VI_2.0` (Sentinel-2).
- [Earthdata bearer token management](https://urs.earthdata.nasa.gov/documentation/for_users/user_token).

An actual public catalog query on 2026-11-19 returned `HLS-VI.L30.T43RDQ.2025003T053640.v2.0`, timestamp `2025-01-03T05:36:40.020Z`, tile cloud cover 100%, and named HTTPS assets `NDVI`, `NDMI`, `Fmask`. The Fmask asset points to the original HLS reflectance product. Asset URLs are read from the catalog, never constructed by guessing filenames. Search uses GET `/stac/LPCLOUD/search` with collection, bbox, datetime, limit and returned pagination links. Both collections are searched. Catalog bbox intersection is a candidate observation, not confirmation of valid pixels in the field.

There is a fill-value discrepancy: the VI guide lists -19999 while NASA dataset variable metadata lists -9999. Both are excluded before scaling; an available GeoTIFF NoData value is also excluded. In particular, -9999 is never treated as a valid -0.9999 measurement.

Protected asset access was not live-verified because this environment has no Earthdata credentials. Public discovery was live-verified. Synthetic GeoTIFFs and HTTP responses exist only in automated tests, never as application fallback data.

## Server setup and secrets

Set `EARTHDATA_TOKEN` to a valid Earthdata Login user bearer token, generated through the Earthdata user profile. Authorize the relevant LP DAAC application if required by the account, and renew expiring tokens. Do not put credentials in Angular, JSON requests, source files, git, URLs or logs. Username/password login and token generation are deliberately not implemented; username/password environment variables are not needed.

Configuration:

| Property | Default | Purpose |
| --- | --- | --- |
| `satellite.earthdata-token` | `${EARTHDATA_TOKEN:}` | Server-only bearer token |
| `satellite.catalog-url` | `https://cmr.earthdata.nasa.gov/stac/LPCLOUD` | Catalog root; change only in controlled tests |
| `satellite.connect-timeout` | `5s` | Per connection timeout |
| `satellite.read-timeout` | `30s` | Per read and download elapsed-time budget |

Catalog requests carry no token. Downloads send a bearer token only to allowlisted HTTPS LP DAAC HLS asset URLs. Redirects are not followed: authentication redirects return an explicit authentication error rather than leaking credentials or reading login HTML as raster data. HTTPS direct downloads are used; temporary AWS S3 credentials are not required.

## Endpoints

All requests use `Content-Type: application/json`. Responses are JSON; errors are `application/problem+json`. Approved development CORS origin is `http://localhost:4200`. No existing endpoint or error handler contract was changed.

| Method | Path | Request dates | Result |
| --- | --- | --- | --- |
| POST | `/api/satellite/field-analysis` | `date` only | All candidate granules on that exact UTC date, field statistics and usable GeoJSON cells |
| POST | `/api/satellite/vegetation-history` | `startDate`, `endDate` only | Historical observations ordered by timestamp and ID, field statistics, no map cells |
| POST | `/api/satellite/available-dates` | `startDate`, `endDate` only | Candidate observation dates and source metadata; quality is not evaluated |

Use `available-dates` first, then select a date for `field-analysis`. Both `NDVI` and `NDMI` are supported, case-sensitive, one indicator per request. Request each separately when both are needed. Days without observations are absent, not zero-valued samples. Multiple sensors/tiles on one day remain separate observations; no daily mosaics or duplicate-day averaging are performed.

## Complete request examples

Field analysis:

```json
{
  "boundary": {
    "type": "Polygon",
    "coordinates": [[[74.35,31.51],[74.354,31.51],[74.354,31.514],[74.35,31.514],[74.35,31.51]]]
  },
  "indicator": "NDVI",
  "date": "2025-01-03"
}
```

Vegetation history:

```json
{
  "boundary": {
    "type": "Polygon",
    "coordinates": [[[74.35,31.51],[74.354,31.51],[74.354,31.514],[74.35,31.514],[74.35,31.51]]]
  },
  "indicator": "NDMI",
  "startDate": "2025-01-01",
  "endDate": "2025-01-10"
}
```

Available dates:

```json
{
  "boundary": {
    "type": "Polygon",
    "coordinates": [[[74.35,31.51],[74.354,31.51],[74.354,31.514],[74.35,31.514],[74.35,31.51]]]
  },
  "indicator": "NDVI",
  "startDate": "2025-01-01",
  "endDate": "2025-01-10"
}
```

`boundary` is a GeoJSON geometry, not a Feature/FeatureCollection. Coordinates are **[longitude, latitude]** in WGS84 decimal degrees, not Leaflet's `LatLng` order. First ring is the exterior; subsequent rings are holes. Every ring must be closed, with at least four coordinate pairs; self-intersections, invalid holes and zero area are rejected. Ring winding is accepted in either direction. Exactly two finite numbers per coordinate are required. Maximum 500 vertices total, 20 rings, extent 0.2 degrees per axis; latitude -80 to 84, longitude -180 to 180. Antimeridian-crossing polygons are unsupported. Maximum area 100 hectares; minimum area 8100 m². Area is measured in the centroid's WGS84 UTM zone. Dates are ISO calendar dates, inclusive, UTC, from 2013-01-01 to today, maximum 366 days. Catalog availability determines actual temporal coverage; a request within these bounds can legitimately have no observations. Mixed single-date/range requests are rejected.

Existing Angular plan models contain points rather than farm polygons. This feature requires a polygon supplied by a future frontend integration; no frontend storage/model migration was performed.

## Response schema

Every successful endpoint returns the same envelope. No field is omitted intentionally; nullable fields are JSON null.

| Field | Type | Meaning |
| --- | --- | --- |
| `status` | string | Envelope state below |
| `indicator` | NDVI or NDMI | Requested index |
| `units` | string | Always `dimensionless` |
| `resolutionMeters` | integer | Always 30 |
| `fieldAreaSquareMeters` | number | UTM polygon area minus holes |
| `limitations` | string | Measurement scope and reliability caveats |
| `observations` | array | Zero or more Observation records |

Observation fields:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | string | Provider granule identifier |
| `collection` | string | `HLSL30_VI_2.0` or `HLSS30_VI_2.0` |
| `source` | string | `NASA HLS-VI v2.0` |
| `observedAt` | ISO instant string | Provider acquisition identifier timestamp |
| `date` | YYYY-MM-DD | UTC day of observedAt |
| `status` | string | Observation state below |
| `tileCloudCoverPercent` | number or null | Catalog tile percentage, never used as field cloud coverage |
| `fieldPixels` | integer | Complete field-contained cells within this tile; zero means not evaluated for available-dates |
| `validPixels` | integer | Cells remaining after quality and index filtering |
| `cloudPixels` | integer | Field cells with cloud/adjacency/shadow bits; QA fill excluded |
| `validPixelFraction` | number | validPixels/fieldPixels, or zero if none/not evaluated |
| `statistics` | object or null | `mean`, `minimum`, `maximum`, `median`, each a dimensionless number; only present for reliable observations |
| `layer` | FeatureCollection or null | Field-analysis GeoJSON; history/dates return null |

Envelope states: `NO_OBSERVATIONS` (empty catalog), `AVAILABLE` (dates only), `COMPLETE` (all observations reliable), `PARTIAL` (some reliable), `NO_SUITABLE_OBSERVATIONS` (none reliable).

Observation states: `QUALITY_NOT_EVALUATED`, `COMPLETE`, `INSUFFICIENT_PIXELS` (fewer than nine whole cells), `CLOUD_OBSCURED` (cloud-related exclusions and insufficient usable coverage), `NO_VALID_DATA`, `INSUFFICIENT_VALID_PIXELS`. Cloud and other exclusions can coexist; `CLOUD_OBSCURED` does not claim clouds are the only reason for missing data. Unreliable observations have null statistics and an empty layer when field-analysis was requested. Their valid pixel counts remain available for explaining rejection.

Complete no-observation response example (field area is geometry-derived, not a satellite observation):

```json
{
  "status": "NO_OBSERVATIONS",
  "indicator": "NDVI",
  "units": "dimensionless",
  "resolutionMeters": 30,
  "fieldAreaSquareMeters": 168398.55850557357,
  "limitations": "Vegetation indicators are not disease diagnoses. Only complete field-contained pixels are used. Minimum nine valid pixels, 50% valid pixels and 50% field-area coverage are engineering thresholds, not a NASA accuracy guarantee. Catalog footprints and cloud percentages are tile-level; available dates do not guarantee usable field pixels. Observations remain separate per granule; no interpolation, nearest-date substitution or daily mosaic. Times identify source granules, not precise field overpass times.",
  "observations": []
}
```

Complete available-dates response example, using actual NASA catalog metadata for one granule (a longer range can return more granules):

```json
{
  "status": "AVAILABLE",
  "indicator": "NDVI",
  "units": "dimensionless",
  "resolutionMeters": 30,
  "fieldAreaSquareMeters": 168398.55850557357,
  "limitations": "Vegetation indicators are not disease diagnoses. Only complete field-contained pixels are used. Minimum nine valid pixels, 50% valid pixels and 50% field-area coverage are engineering thresholds, not a NASA accuracy guarantee. Catalog footprints and cloud percentages are tile-level; available dates do not guarantee usable field pixels. Observations remain separate per granule; no interpolation, nearest-date substitution or daily mosaic. Times identify source granules, not precise field overpass times.",
  "observations": [
    {
      "id": "HLS-VI.L30.T43RDQ.2025003T053640.v2.0",
      "collection": "HLSL30_VI_2.0",
      "source": "NASA HLS-VI v2.0",
      "observedAt": "2025-01-03T05:36:40.020Z",
      "date": "2025-01-03",
      "status": "QUALITY_NOT_EVALUATED",
      "tileCloudCoverPercent": 100.0,
      "fieldPixels": 0,
      "validPixels": 0,
      "cloudPixels": 0,
      "validPixelFraction": 0.0,
      "statistics": null,
      "layer": null
    }
  ]
}
```

For a reliable observation, `statistics` has this complete shape. These numbers are **synthetic unit-test fixture values**, not a NASA observation or a live integration result:

```json
{"mean":0.5,"minimum":0.5,"maximum":0.5,"median":0.5}
```

`layer` is standard GeoJSON with this shape (empty when no reliable pixels). Each feature has a closed WGS84 Polygon containing one whole 30 m raster cell and properties `{"value": <scaled index>}`. Use Leaflet `L.geoJSON(observation.layer, {style: ...})` to render it; coordinate conversion to Leaflet is handled by GeoJSON support. Features are bounded to the submitted polygon, including exclusion of holes; no provider URLs or secrets are returned. There are at most approximately 1111 whole cells per 100-hectare field.

```json
{"type":"FeatureCollection","features":[]}
```

## Processing and quality policy

1. Validate dates, index, polygon topology and area before contacting NASA.
2. Discover both VI collections using the polygon bounding box; follow provider pagination without silent truncation.
3. Download the selected VI and its catalog-linked Fmask, capped at 100 MB per asset. Only selected field windows are decoded. Reject malformed TIFFs, missing georeferencing, rotated grids, non-30 m pixels, unsupported CRS, and mismatched VI/QA grids.
4. Reproject polygon and holes into the raster's actual WGS84 UTM CRS. Include only pixels whose full 30 m footprints are covered by the field. This deliberately excludes boundary-mixed pixels and can make narrow fields unsuitable despite sufficient total area.
5. Reject QA fill 255 and flags in bits 0 through 5 (reserved cirrus, cloud, adjacency, shadow, snow/ice, water). Reject high aerosol (bits 6–7 both set); accept climatological, low and medium aerosol without treating those as a guarantee of accuracy. Exclude fill values, nonfinite and out-of-range VI samples, then apply scale 0.0001. No smoothing, resampling or spatial interpolation.
6. Require at least nine valid pixels, valid fraction at least 0.5, and valid cell area at least 50% of the submitted field area. These are conservative product engineering thresholds, not NASA's claim of a universal minimum farm size or scientific reliability certification. Per-tile results are not mosaicked; a field straddling tiles may consequently have rejected observations.
7. Calculate arithmetic mean, minimum, maximum and median on the retained equal-area pixels, without intermediate rounding. Return statistics/map only when thresholds pass.

Synchronous processing only; there is no background worker, job persistence or polling endpoint. Maximum 32 granules per history/analysis request, 200 per catalog date lookup, five pages per collection. Split long ranges if these limits are reached. One uncached satellite request is processed per application instance; concurrent work returns `SATELLITE_BUSY`. Metadata cache: 64 entries/5 minutes. Complete response cache: 16 entries/5 minutes. Errors are not cached. Caches are process-local and bounded; restart clears them. Source data may lag acquisitions by several days.

The processing loop has a 120-second budget, checked between granules. An in-flight connection/download is bounded by its own 5/30-second timeouts. This is not a strict 120-second HTTP wall-clock deadline; configure reverse proxy timeouts accordingly, or use shorter ranges. Raster CPU processing and the bounded catalog pagination can add time. No asynchronous job infrastructure is implied.

## Errors

All exceptions stop the request; an upstream error never silently returns partial history or `NO_OBSERVATIONS`. A downstream authentication error is HTTP 502, not an assertion that the Angular user is unauthenticated.

| HTTP | `code` | Meaning/action |
| --- | --- | --- |
| 400 | `INVALID_REQUEST` | Invalid/missing indicator or dates, malformed JSON |
| 400 | `INVALID_BOUNDARY` | Unsupported/invalid GeoJSON, topology, coordinate, vertex or extent limit |
| 400 | `FIELD_TOO_LARGE` | More than 100 hectares |
| 422 | `FIELD_TOO_SMALL` | Below 8100 m²; use a higher-resolution source or larger field |
| 422 | `TOO_MANY_OBSERVATIONS` | Narrow/split requested range |
| 503 | `EARTHDATA_NOT_CONFIGURED` | Set server `EARTHDATA_TOKEN` |
| 502 | `EARTHDATA_AUTHENTICATION_FAILED` | Expired/invalid token, authorization denial or login redirect |
| 502 | `PROVIDER_ERROR` | NASA failure, malformed/unsafe catalog assets, raster mismatch or unsupported data |
| 503 | `PROVIDER_RATE_LIMITED` | NASA 429; retry later |
| 504 | `PROVIDER_TIMEOUT` | NASA connection/read/download timeout |
| 504 | `PROCESSING_TIMEOUT` | Processing budget exhausted; split range |
| 503 | `SATELLITE_BUSY` | Processor busy; retry later |

Complete authentication configuration error response:

```json
{
  "title": "Service Unavailable",
  "status": 503,
  "detail": "Configure a server-side Earthdata bearer token to read protected HLS assets.",
  "instance": "/api/satellite/field-analysis",
  "code": "EARTHDATA_NOT_CONFIGURED"
}
```

Complete small-field error response:

```json
{
  "title": "Unprocessable Content",
  "status": 422,
  "detail": "At least 8100 square meters (nine 30 m pixels) are required; this is an engineering reliability threshold.",
  "instance": "/api/satellite/field-analysis",
  "code": "FIELD_TOO_SMALL"
}
```

HTTP 200 with `NO_OBSERVATIONS`, `NO_SUITABLE_OBSERVATIONS`, or per-observation rejection statuses is a successful evaluation of data availability/quality, not a successful vegetation measurement. Do not display null statistics as zero, and do not color unavailable pixels as healthy vegetation.

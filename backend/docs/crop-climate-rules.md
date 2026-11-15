# Preliminary planting-window air-temperature comparison

Rules version: `air-temperature-reference-v1`. Approved on 2026-11-15.

## Purpose and limits

`POST /api/crop-suitability` compares historical daily mean air temperature (NASA POWER T2M, C) during the farmer's **planting start window** with general crop temperature references. The window is the interval in which the farmer might begin planting, not a growing season or the first days after a particular sowing date.

This is a preliminary reference comparison, not a validated model of establishment, a final planting recommendation, a ranking, a yield estimate or a guarantee of success. The cited references do not validate this classification algorithm. Applying general temperature guidance to daily mean T2M is an explicitly approved engineering simplification. These ranges are not universal success, survival or damage thresholds and have not been locally validated for Pakistan or every cultivar. Outdoor NASA grid data do not represent protected cultivation or field microclimate precisely.

## Approved reference ranges

| Crop ID | Original range | Basis | Source |
| --- | --- | --- | --- |
| potato | 18-20 C | FAO optimum mean daily temperatures for yield, corroborated by BAMIS planting-time temperature guidance; not a seed-tuber soil-readiness threshold | [FAO, Cultivation](https://www.fao.org/4/i0500e/i0500e.pdf), [BAMIS Potato](https://www.bamis.gov.bd/en/crops/view/52/) |
| tomato | 60-80 F | Optimum air temperature for plant development, Appendix B | [Oregon State University Extension, EM 9032](https://extension.oregonstate.edu/catalog/em-9032-educators-guide-vegetable-gardening?reference=catalog) |
| pepper | 70-80 F | Optimum air temperature for plant development, Appendix B; the application does not identify species/cultivar | [OSU, EM 9032](https://extension.oregonstate.edu/catalog/em-9032-educators-guide-vegetable-gardening?reference=catalog) |
| cucumber | 75-85 F | Optimum air temperature for development of pickling/slicing transplants, Appendix B | [OSU, EM 9032](https://extension.oregonstate.edu/catalog/em-9032-educators-guide-vegetable-gardening?reference=catalog) |
| carrot | 60-65 F | Optimum air temperature for plant development, Appendix A, distinct from the soil-temperature column | [OSU, EM 9032](https://extension.oregonstate.edu/catalog/em-9032-educators-guide-vegetable-gardening?reference=catalog) |
| onion | 55-75 F | General optimum temperature reference, page 1; not a stage-specific germination or bulbing rule | [UC Cooperative Extension, Vegetable Characteristics, 31-043C, May 2011](https://ucanr.edu/sites/default/files/2017-01/142583.pdf) |

Convert Fahrenheit with `(F - 32) * 5 / 9` using floating-point arithmetic. No rounding before comparison. Displayed limits in explanatory text use two decimal places; `referenceRange` contains the calculation limits and source URLs. References differ: for example UCCE gives a narrower tomato optimum than the selected OSU range. Do not average, union or silently substitute ranges from different sources. Changes require a new documented rules version and approval.

## Algorithm

For each requested crop, count valid daily T2M values strictly below the lower bound, inside both inclusive bounds, and strictly above the upper bound. `validDays` is their sum; `missingDays` is the inclusive requested day count minus validDays. The historical source period preserves that day count. Null/non-finite temperature values are not classified or replaced with zero. Rainfall, humidity and radiation do not contribute to temperature classification.

Every `suitability` begins with `Preliminary: `:

| Condition, in precedence order | Label after prefix |
| --- | --- |
| No valid temperature days | Insufficient temperature data |
| At least one missing temperature day | Limited temperature data |
| Complete temperature; every day within reference | Within reference range |
| Complete temperature; every day below reference | Cooler than reference |
| Complete temperature; every day above reference | Warmer than reference |
| Complete temperature; more than one category represented | Variable temperatures |

Requiring complete temperature data for a whole-window category is a conservative product policy, not a scientifically derived coverage threshold. Always return below/within/above and missing counts, including for variable or partial data. Days outside an optimum reference do not imply damage. No percentage, suitability score, ordering by crop fitness or automatic final crop selection is calculated.

## Historical periods and unavailable assessments

Reuse `PlantingClimateService`: periods ending before today's UTC date use direct historical data. Periods including today or the future use one comparable historical window ending no later than December 31 of the previous year, with identical month/day endpoints and inclusive day count; Feb 29 is never clamped to Feb 28. `climate.summary.period` identifies actual source years, while `climate.requestedPeriod` identifies requested years. `isForecast` is always false. One historical analogue is not a forecast or a multi-year climate normal.

Soil temperature, actual nighttime minima, irrigation and soil moisture, cultivar and planting method, pests/diseases, day length and the full growing season are not assessed. Do not substitute T2M for soil germination requirements ([OSU soil-temperature guidance](https://extension.oregonstate.edu/catalog/soil-temperature-conditions-vegetable-seed-germination)) or nighttime transplant requirements ([Colorado State University tomato guidance](https://extension.colostate.edu/resource/growing-tomatoes/)). Rainfall is not total water supply; solar energy is not direct sunshine hours. Existing summary rainfall remains the total over available days only.

## Contract and validation

Request: `latitude`, `longitude`, `plantingWindow: {from, to}`, `comparisonCrops`. Coordinates must be finite and in geographic bounds. Both calendar dates are required; `to > from` matches Angular. Existing 366-day and historical-coverage restrictions apply. Accept 1-6 unique exact lowercase supported crop IDs. Preserve request order; do not mutate frontend state or select a final crop.

Response: assessmentScope, assessmentBasis, rulesVersion, limitations, climate (existing PlantingClimateResponse), and crops. Each crop contains id, name, suitability, detail, temperatureEvidence and referenceRange (C limits, basis, sources). Scope is `PLANTING_WINDOW_AIR_TEMPERATURE`. Detail names the historical period, counts and limitations. All crops share one NASA request. Validate inputs before making that request.

Invalid body/coordinates/crops/dates return 400, no comparable source period 422, upstream failure/malformed data/unsupported units 502, and timeout 504. Missing NASA data is a successful response with explicit data status and insufficient/limited temperature evidence, not an upstream failure. Existing daily/summary/planting-summary contracts remain unchanged.

Angular integration is a separate task. The row fields match its Recommendations component, but HTTP wiring, mock copy and any future presentation changes are not part of this backend implementation.

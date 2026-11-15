import { of } from 'rxjs';
import { CropSuitabilityRequest, CropSuitabilityResponse } from '../models/crop-suitability';
import { CropSuitabilityService } from '../services/crop-suitability.service';

export function comparisonFixture(request: CropSuitabilityRequest): CropSuitabilityResponse {
  const average = { average: 20, unit: 'C', validDays: 2 };
  return {
    assessmentScope: 'PLANTING_WINDOW_AIR_TEMPERATURE', assessmentBasis: 'Preliminary air-temperature comparison.', rulesVersion: 'test', limitations: 'Not a final planting recommendation.',
    climate: {
      requestedPeriod: { start: request.plantingWindow.from, end: request.plantingWindow.to }, requestedDays: 2,
      dataMode: 'HISTORICAL_ESTIMATE', isForecast: false, method: 'Single comparable historical period; not a forecast.',
      summary: {
        latitude: request.latitude, longitude: request.longitude, period: { start: '2025-01-01', end: '2025-01-02' }, timeStandard: 'UTC', source: 'NASA POWER', sourceUrl: 'https://power.larc.nasa.gov', dataStatus: 'COMPLETE', hasMissingData: false, expectedDays: 2,
        temperature: { ...average, minimumTemperature: 19, maximumTemperature: 21, basis: 'Daily means, not actual temperature extremes.' },
        precipitation: { totalPrecipitation: 0, basis: 'Available days only.', completePeriod: true, unit: 'mm', validDays: 2 },
        relativeHumidity: { ...average, unit: '%' }, solarRadiation: { ...average, unit: 'MJ/m^2/day' },
      },
    },
    crops: request.comparisonCrops.map(id => ({ id, name: id[0].toUpperCase() + id.slice(1), suitability: 'Preliminary: Variable temperatures', detail: 'Historical daily mean air-temperature comparison, not a forecast.', temperatureEvidence: { validDays: 2, missingDays: 0, belowRangeDays: 1, withinRangeDays: 1, aboveRangeDays: 0 }, referenceRange: { minimum: 18, maximum: 20, unit: 'C', basis: 'Reference only', sources: [] } })),
  };
}

export const comparisonProvider = { provide: CropSuitabilityService, useValue: { assess: (request: CropSuitabilityRequest) => of(comparisonFixture(request)) } };

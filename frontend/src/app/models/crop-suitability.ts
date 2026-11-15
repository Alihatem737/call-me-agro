import { ComparisonCrop } from '../services/plan-draft.service';

export interface CropSuitabilityRequest {
  latitude: number;
  longitude: number;
  plantingWindow: { from: string; to: string };
  comparisonCrops: ComparisonCrop[];
}

interface Average {
  average: number | null;
  unit: string;
  validDays: number;
}

export interface CropSuitabilityResponse {
  assessmentScope: string;
  assessmentBasis: string;
  rulesVersion: string;
  limitations: string;
  climate: {
    requestedPeriod: { start: string; end: string };
    requestedDays: number;
    dataMode: 'HISTORICAL_DATA' | 'HISTORICAL_ESTIMATE';
    isForecast: boolean;
    method: string;
    summary: {
      latitude: number;
      longitude: number;
      period: { start: string; end: string };
      timeStandard: string;
      source: string;
      sourceUrl: string;
      dataStatus: 'COMPLETE' | 'PARTIAL' | 'NO_VALID_DATA';
      hasMissingData: boolean;
      expectedDays: number;
      temperature: Average & { minimumTemperature: number | null; maximumTemperature: number | null; basis: string };
      precipitation: { totalPrecipitation: number | null; basis: string; completePeriod: boolean; unit: string; validDays: number };
      relativeHumidity: Average;
      solarRadiation: Average;
    };
  };
  crops: {
    id: ComparisonCrop;
    name: string;
    suitability: string;
    detail: string;
    temperatureEvidence: { validDays: number; missingDays: number; belowRangeDays: number; withinRangeDays: number; aboveRangeDays: number };
    referenceRange: { minimum: number; maximum: number; unit: string; basis: string; sources: { title: string; url: string }[] };
  }[];
}

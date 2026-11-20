import type { FeatureCollection, Polygon } from 'geojson';
import type { FieldBoundary } from './field-boundary';

export type VegetationIndicator = 'NDVI' | 'NDMI';
export type VegetationLayer = FeatureCollection<Polygon, { value: number }>;

export interface ObservationRange {
  startDate: string;
  endDate: string;
}

export interface SatelliteObservation {
  id: string;
  collection: 'HLSL30_VI_2.0' | 'HLSS30_VI_2.0';
  source: string;
  observedAt: string;
  date: string;
  status: 'QUALITY_NOT_EVALUATED' | 'COMPLETE' | 'INSUFFICIENT_PIXELS' | 'CLOUD_OBSCURED'
    | 'NO_VALID_DATA' | 'INSUFFICIENT_VALID_PIXELS';
  tileCloudCoverPercent: number | null;
  fieldPixels: number;
  validPixels: number;
  cloudPixels: number;
  validPixelFraction: number;
  statistics: { mean: number; minimum: number; maximum: number; median: number } | null;
  layer: VegetationLayer | null;
}

export interface SatelliteResponse {
  status: 'NO_OBSERVATIONS' | 'AVAILABLE' | 'COMPLETE' | 'PARTIAL' | 'NO_SUITABLE_OBSERVATIONS';
  indicator: VegetationIndicator;
  units: string;
  resolutionMeters: number;
  fieldAreaSquareMeters: number;
  limitations: string;
  observations: SatelliteObservation[];
}

export function toBoundaryGeometry(boundary: FieldBoundary): Polygon {
  const ring = boundary.map(({ longitude, latitude }) => [longitude, latitude]);
  return { type: 'Polygon', coordinates: [[...ring, [...ring[0]]]] };
}

export const vegetationLegend = [
  { upper: 0, color: '#9d4938', label: '−1 to below 0' },
  { upper: .3, color: '#d5984c', label: '0 to below 0.3' },
  { upper: .6, color: '#95aa49', label: '0.3 to below 0.6' },
  { upper: 1, color: '#326344', label: '0.6 to 1' },
];

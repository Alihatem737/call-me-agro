import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import type { Polygon } from 'geojson';
import { timeout } from 'rxjs';
import type { ObservationRange, SatelliteResponse, VegetationIndicator } from '../models/satellite-monitoring';

@Injectable({ providedIn: 'root' })
export class SatelliteMonitoringService {
  private readonly http = inject(HttpClient);
  private readonly url = 'http://localhost:8080/api/satellite';

  availableDates(boundary: Polygon, indicator: VegetationIndicator, range: ObservationRange) {
    return this.request('available-dates', { boundary, indicator, ...range });
  }

  fieldAnalysis(boundary: Polygon, indicator: VegetationIndicator, date: string) {
    return this.request('field-analysis', { boundary, indicator, date });
  }

  vegetationHistory(boundary: Polygon, indicator: VegetationIndicator, range: ObservationRange) {
    return this.request('vegetation-history', { boundary, indicator, ...range });
  }

  private request(endpoint: string, body: object) {
    return this.http.post<SatelliteResponse>(`${this.url}/${endpoint}`, body).pipe(timeout(180000));
  }
}

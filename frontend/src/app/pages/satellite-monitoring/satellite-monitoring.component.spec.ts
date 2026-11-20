import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { PlannedPlan } from '../../models/planned-plan';
import { SatelliteObservation, SatelliteResponse, VegetationIndicator } from '../../models/satellite-monitoring';
import { PLANS_STORAGE_KEY } from '../../services/plan-storage.service';
import { SatelliteMonitoringComponent } from './satellite-monitoring.component';

describe('Satellite Field Monitoring', () => {
  const boundary = [{ latitude: 31.51, longitude: 74.35 }, { latitude: 31.51, longitude: 74.354 },
    { latitude: 31.514, longitude: 74.354 }, { latitude: 31.514, longitude: 74.35 }];
  const polygon = { type: 'Polygon', coordinates: [[[74.35, 31.51], [74.354, 31.51], [74.354, 31.514], [74.35, 31.514], [74.35, 31.51]]] };
  const plan: PlannedPlan = {
    id: 'field', name: 'North Field', location: 'Farm location', journey: 'planning-to-plant',
    latitude: 31.51, longitude: 74.35, selectedCrop: 'potato', status: 'growing',
    plantingWindow: { from: '2024-12-01', to: '2025-01-01' }, fieldBoundary: boundary,
  };
  const base = 'http://localhost:8080/api/satellite/';
  const path = '/plans/field/satellite';
  const candidate: SatelliteObservation = {
    id: 'fixture-L30', collection: 'HLSL30_VI_2.0', source: 'NASA HLS-VI v2.0',
    observedAt: '2025-01-03T05:36:40.020Z', date: '2025-01-03', status: 'QUALITY_NOT_EVALUATED',
    tileCloudCoverPercent: 100, fieldPixels: 0, validPixels: 0, cloudPixels: 0, validPixelFraction: 0,
    statistics: null, layer: null,
  };
  const complete: SatelliteObservation = {
    ...candidate, status: 'COMPLETE', fieldPixels: 10, validPixels: 9, validPixelFraction: .9,
    statistics: { mean: 0, minimum: -.2, maximum: .2, median: 0 },
    layer: {
      type: 'FeatureCollection',
      features: [{
        type: 'Feature', properties: { value: .2 },
        geometry: { type: 'Polygon', coordinates: [[[74.351, 31.511], [74.3513, 31.511], [74.3513, 31.5113], [74.351, 31.5113], [74.351, 31.511]]] },
      }],
    },
  };
  let http: HttpTestingController;
  let read: jasmine.Spy;

  function envelope(status: SatelliteResponse['status'], observations: SatelliteObservation[], indicator: VegetationIndicator = 'NDVI'): SatelliteResponse {
    return { status, observations, indicator, units: 'dimensionless', fieldAreaSquareMeters: 168398,
      resolutionMeters: 30, limitations: 'Catalog availability does not guarantee usable field pixels.' };
  }

  beforeEach(() => {
    read = spyOn(Storage.prototype, 'getItem').and.callFake(key => key === PLANS_STORAGE_KEY ? JSON.stringify([plan]) : null);
    TestBed.configureTestingModule({ providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()] });
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  async function open() {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(path, SatelliteMonitoringComponent);
    return { harness, page, text: () => harness.routeNativeElement!.textContent ?? '' };
  }

  it('protects Planned plans and redirects boundaryless Growing plans before issuing HTTP', async () => {
    read.and.returnValue(JSON.stringify([{ ...plan, status: 'planned' }]));
    const harness = await RouterTestingHarness.create(path);
    expect(TestBed.inject(Router).url).toBe('/plans/field/dashboard');
    read.and.returnValue(JSON.stringify([{ ...plan, fieldBoundary: null }]));
    await harness.navigateByUrl(path);
    expect(TestBed.inject(Router).url).toBe('/plans/field/satellite/boundary');
    http.expectNone(base + 'available-dates');
  });

  it('submits closed GeoJSON, renders measured cells and zero averages, and keeps granules distinct in history', async () => {
    const { harness, page, text } = await open();
    const initial = http.expectOne(base + 'available-dates');
    expect(initial.request.method).toBe('POST');
    expect(initial.request.body).toEqual({ boundary: polygon, indicator: 'NDVI', startDate: page.startDate, endDate: page.endDate });
    page.startDate = '2025-01-01';
    page.endDate = '2025-01-10';
    page.loadRange();
    expect(initial.cancelled).toBeTrue();
    const secondDate = { ...candidate, id: 'fixture-other-date', date: '2025-01-02', observedAt: '2025-01-02T05:36:40Z' };
    http.expectOne(base + 'available-dates').flush(envelope('AVAILABLE', [candidate, secondDate]));
    const analysis = http.expectOne(base + 'field-analysis');
    expect(analysis.request.method).toBe('POST');
    expect(analysis.request.body).toEqual({ boundary: polygon, indicator: 'NDVI', date: '2025-01-03' });
    harness.detectChanges();
    expect(text()).toContain('Field pixel quality is evaluated during analysis.');
    expect(text()).not.toContain('Average NDVI');
    expect(harness.routeNativeElement!.querySelector<HTMLButtonElement>('.range button')?.disabled).toBeTrue();
    expect(harness.routeNativeElement!.querySelector<HTMLSelectElement>('.controls select')?.disabled).toBeTrue();
    http.expectNone(base + 'vegetation-history');
    const cloudy: SatelliteObservation = { ...candidate, id: 'fixture-cloudy', status: 'CLOUD_OBSCURED', fieldPixels: 12, cloudPixels: 10 };
    analysis.flush(envelope('PARTIAL', [cloudy, complete]));
    const history = http.expectOne(base + 'vegetation-history');
    expect(history.request.method).toBe('POST');
    expect(history.request.body).toEqual({ boundary: polygon, indicator: 'NDVI', startDate: '2025-01-01', endDate: '2025-01-10' });
    history.flush(envelope('PARTIAL', [
      { ...complete, ...secondDate, status: 'COMPLETE', statistics: complete.statistics },
      { ...complete, layer: null },
      { ...complete, id: 'fixture-S30', collection: 'HLSS30_VI_2.0', observedAt: '2025-01-03T06:30:00Z', layer: null },
      cloudy,
    ]));
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('.value')?.textContent).toBe('0.00');
    expect(harness.routeNativeElement!.querySelector<HTMLButtonElement>('.range button')?.disabled).toBeFalse();
    expect(harness.routeNativeElement!.querySelector('path[fill="#d5984c"]')).not.toBeNull();
    expect(harness.routeNativeElement!.querySelectorAll('circle').length).toBe(3);
    expect(text()).toContain('30 m resolution');
    page.selectObservation(cloudy.id);
    harness.detectChanges();
    expect(text()).toContain('Clouds or cloud shadows');
    expect(harness.routeNativeElement!.querySelector('path[fill="#d5984c"]')).toBeNull();
    page.selectDate('2025-01-02');
    http.expectOne(base + 'field-analysis').flush(envelope('NO_SUITABLE_OBSERVATIONS', [
      { ...secondDate, status: 'INSUFFICIENT_VALID_PIXELS', fieldPixels: 12, validPixels: 4 },
    ]));
    harness.detectChanges();
    expect(text()).toContain('Too few pixels passed quality checks');
    http.expectNone(base + 'vegetation-history');
  });

  it('keeps catalog dates through the Earthdata configuration error, changes indicator, and distinguishes empty and provider responses', async () => {
    const { harness, page, text } = await open();
    http.expectOne(base + 'available-dates').flush(envelope('AVAILABLE', [candidate]));
    http.expectOne(base + 'field-analysis').flush({
      title: 'Service Unavailable', status: 503, detail: 'Configure a server-side Earthdata bearer token to read protected HLS assets.',
      instance: '/api/satellite/field-analysis', code: 'EARTHDATA_NOT_CONFIGURED',
    }, { status: 503, statusText: 'Service Unavailable' });
    harness.detectChanges();
    expect(text()).toContain('The server needs Earthdata access');
    expect(text()).toContain('2025-01-03');
    expect(text()).not.toContain('Average NDVI');
    http.expectNone(base + 'vegetation-history');

    page.retry();
    http.expectOne(base + 'field-analysis').flush({ status: 502, code: 'EARTHDATA_AUTHENTICATION_FAILED' },
      { status: 502, statusText: 'Bad Gateway' });
    harness.detectChanges();
    expect(text()).toContain('could not authenticate with NASA Earthdata');

    page.selectIndicator('NDMI');
    const catalog = http.expectOne(base + 'available-dates');
    expect(catalog.request.body.indicator).toBe('NDMI');
    catalog.flush(envelope('NO_OBSERVATIONS', [], 'NDMI'));
    harness.detectChanges();
    expect(text()).toContain('No satellite observations were found in the selected date range');
    http.expectNone(base + 'field-analysis');

    page.loadRange();
    http.expectOne(base + 'available-dates').flush({ status: 502, code: 'PROVIDER_ERROR' },
      { status: 502, statusText: 'Bad Gateway' });
    harness.detectChanges();
    expect(text()).toContain('NASA imagery could not be retrieved or processed');
  });

  it('handles a too-small field and preserves the boundary in the unavailable view', async () => {
    const { harness, text } = await open();
    http.expectOne(base + 'available-dates').flush({ status: 422, code: 'FIELD_TOO_SMALL' },
      { status: 422, statusText: 'Unprocessable Content' });
    harness.detectChanges();
    expect(text()).toContain('8,100 m²');
    expect(text()).toContain('Your field boundary is still saved');
    expect(harness.routeNativeElement!.querySelector('app-farm-map')).not.toBeNull();
    expect(harness.routeNativeElement!.querySelector('a[href="/plans/field/satellite/boundary"]')).not.toBeNull();
  });
});

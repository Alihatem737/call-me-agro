import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { RecommendationsComponent } from './recommendations.component';
import { PlanDraftService } from '../../services/plan-draft.service';
import { comparisonFixture } from '../../testing/crop-suitability.fixture';
import { CropSuitabilityRequest } from '../../models/crop-suitability';
import { validPlantingWindow } from '../planting-window/planting-window.component';

describe('Recommendations HTTP integration', () => {
  const url = 'http://localhost:8080/api/crop-suitability';
  const request: CropSuitabilityRequest = {
    latitude: 31.5204, longitude: 74.3587,
    plantingWindow: { from: '2027-11-01', to: '2028-02-29' }, comparisonCrops: ['tomato', 'potato'],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [RecommendationsComponent], providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()] });
    const drafts = TestBed.inject(PlanDraftService);
    drafts.update('planning-to-plant', { name: 'Integration field', latitude: request.latitude, longitude: request.longitude });
    drafts.updatePlantingWindow(request.plantingWindow);
    drafts.updateComparisonCrops(request.comparisonCrops);
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('posts real draft values, blocks loading actions and renders API labels without ranking', () => {
    const fixture = TestBed.createComponent(RecommendationsComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;
    const pending = TestBed.inject(HttpTestingController).expectOne(url);
    expect(pending.request.method).toBe('POST');
    expect(pending.request.body).toEqual(request);
    expect(fixture.nativeElement.textContent).toContain('Loading NASA');
    expect(fixture.nativeElement.querySelector('.next').disabled).toBeTrue();
    component.select('tomato');
    expect(component.selected).toBeNull();
    pending.flush(comparisonFixture(request));
    fixture.detectChanges();
    expect(component.crops.map(crop => crop.id)).toEqual(['tomato', 'potato']);
    expect(fixture.nativeElement.textContent).toContain('Historical estimate, not a forecast');
    expect(fixture.nativeElement.textContent).toContain('COMPLETE');
    component.select('tomato');
    component.select('potato');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('[aria-pressed="true"]').length).toBe(1);
  });

  for (const status of [0, 400, 422, 502, 504]) {
    it(`supports retry after HTTP ${status} without losing the selected crop`, () => {
      TestBed.inject(PlanDraftService).updateSelectedCrop('tomato');
      const fixture = TestBed.createComponent(RecommendationsComponent);
      const http = TestBed.inject(HttpTestingController);
      const pending = http.expectOne(url);
      if (status === 0) pending.error(new ProgressEvent('error'));
      else pending.flush({ detail: 'Service unavailable' }, { status, statusText: 'Error' });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('[role="alert"]')).not.toBeNull();
      expect(fixture.nativeElement.querySelector('.next').disabled).toBeTrue();
      fixture.nativeElement.querySelector('.comparison button').click();
      http.expectOne(url).flush(comparisonFixture(request));
      fixture.detectChanges();
      expect(fixture.componentInstance.selected).toBe('tomato');
      expect(fixture.nativeElement.querySelectorAll('[aria-pressed="true"]').length).toBe(1);
    });
  }

  for (const status of ['PARTIAL', 'NO_VALID_DATA'] as const) {
    it(`shows ${status}, null values and incomplete rainfall without inventing values`, () => {
      const fixture = TestBed.createComponent(RecommendationsComponent);
      const response = comparisonFixture(request);
      response.climate.summary.dataStatus = status;
      response.climate.summary.hasMissingData = true;
      response.climate.summary.temperature.average = null;
      response.climate.summary.precipitation.completePeriod = false;
      TestBed.inject(HttpTestingController).expectOne(url).flush(response);
      fixture.detectChanges();
      expect(fixture.nativeElement.textContent).toContain(status);
      expect(fixture.nativeElement.textContent).toContain('Unavailable');
      expect(fixture.nativeElement.textContent).toContain('available days only');
      expect(fixture.componentInstance.measurement(0, 'mm')).toBe('0 mm');
    });
  }

  it('rejects incomplete comparisons and cancels a request when leaving', () => {
    const fixture = TestBed.createComponent(RecommendationsComponent);
    const response = comparisonFixture(request);
    response.crops.pop();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne(url).flush(response);
    expect(fixture.componentInstance.error).toContain('incomplete');
    fixture.componentInstance.load();
    const pending = http.expectOne(url);
    fixture.destroy();
    expect(pending.cancelled).toBeTrue();
  });

  it('times out a slow request and permits retry', fakeAsync(() => {
    const fixture = TestBed.createComponent(RecommendationsComponent);
    const http = TestBed.inject(HttpTestingController);
    const pending = http.expectOne(url);
    tick(45000);
    expect(pending.cancelled).toBeTrue();
    expect(fixture.componentInstance.error).toContain('timed out');
    fixture.componentInstance.load();
    http.expectOne(url).flush(comparisonFixture(request));
    expect(fixture.componentInstance.error).toBe('');
    expect(fixture.componentInstance.response).not.toBeNull();
  }));

  it('matches the backend inclusive date limits and valid leap-day rules', () => {
    expect(validPlantingWindow({ from: '1980-12-31', to: '1981-01-02' })).toBeFalse();
    expect(validPlantingWindow({ from: '1981-01-01', to: '1982-01-01' })).toBeTrue();
    expect(validPlantingWindow({ from: '1981-01-01', to: '1982-01-02' })).toBeFalse();
    expect(validPlantingWindow({ from: '2027-02-29', to: '2027-03-01' })).toBeFalse();
    expect(validPlantingWindow({ from: '2028-02-29', to: '2028-03-01' })).toBeTrue();
    expect(validPlantingWindow({ from: '2028-03-01', to: '2028-03-01' })).toBeFalse();
  });
});

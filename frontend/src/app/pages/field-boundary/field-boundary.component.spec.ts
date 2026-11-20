import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { By } from '@angular/platform-browser';
import { NavigationEnd, provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import * as L from 'leaflet';
import { filter, firstValueFrom } from 'rxjs';
import { routes } from '../../app.routes';
import { FarmMapComponent } from '../../components/farm-map/farm-map.component';
import { GrowingPlan } from '../../models/growing-plan';
import { PlannedPlan } from '../../models/planned-plan';
import { PLANS_STORAGE_KEY } from '../../services/plan-storage.service';
import { FieldBoundaryComponent } from './field-boundary.component';

describe('Draw Field Boundary', () => {
  const oldPlan: PlannedPlan = {
    id: 'north', name: 'North field', location: 'Farm location', journey: 'planning-to-plant',
    latitude: 31, longitude: 31, selectedCrop: 'potato', status: 'planned',
    plantingWindow: { from: '2026-12-01', to: '2027-01-01' },
  };
  const other: GrowingPlan = {
    id: 'south', name: 'South field', location: 'Farm location', journey: 'already-planted',
    latitude: 30, longitude: 30, selectedCrop: 'tomato', status: 'growing', plantingDate: '2024-04-02',
  };
  const growing = { ...oldPlan, status: 'growing', plantingDate: '2024-04-02', existingField: 'preserved' };
  const dashboard = '/plans/north/dashboard';
  const editor = '/plans/north/satellite/boundary';
  let raw: string;
  let write: jasmine.Spy;

  beforeEach(() => {
    raw = JSON.stringify([oldPlan, other]);
    spyOn(Storage.prototype, 'getItem').and.callFake(key => key === PLANS_STORAGE_KEY ? raw : null);
    write = spyOn(Storage.prototype, 'setItem').and.callFake((key, value) => {
      if (key === PLANS_STORAGE_KEY) raw = value;
    });
    TestBed.configureTestingModule({ providers: [provideRouter(routes), provideHttpClient(), provideHttpClientTesting()] });
  });

  afterEach(() => TestBed.inject(HttpTestingController).verify());

  it('gates the card and direct route by status, including a plan converted to Growing', async () => {
    const harness = await RouterTestingHarness.create(editor);
    const router = TestBed.inject(Router);
    expect(router.url).toBe(dashboard);
    expect(harness.routeNativeElement!.querySelector('.satellite-monitoring')).toBeNull();
    await harness.navigateByUrl('/plans/missing/satellite/boundary');
    expect(router.url).toBe('/plans/missing/dashboard');
    raw = JSON.stringify([growing, other]);
    await harness.navigateByUrl(dashboard);
    harness.routeNativeElement!.querySelector<HTMLButtonElement>('.satellite-monitoring button')!.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(router.url).toBe(editor);
    expect(harness.routeNativeElement!.textContent).toContain('North field');
    expect(write).not.toHaveBeenCalled();
  });

  it('draws using Leaflet, rejects a crossing, edits a corner and reloads only the saved plan outline', async () => {
    raw = JSON.stringify([growing, other]);
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl(editor, FieldBoundaryComponent);
    const mapComponent = harness.routeDebugElement!.query(By.directive(FarmMapComponent)).componentInstance as FarmMapComponent;
    const map = (mapComponent as unknown as { map: L.Map }).map;
    const click = (latitude: number, longitude: number) => {
      map.fire('click', { latlng: L.latLng(latitude, longitude) });
      harness.detectChanges();
    };
    const button = (text: string) =>
      Array.from(harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('button'))
        .find(element => element.textContent?.trim().startsWith(text))!;

    click(31, 31);
    click(31.001, 31.001);
    click(31.001, 31);
    click(31, 31.001);
    button('Save field boundary').click();
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('[role="alert"]')?.textContent).toContain('crossing');
    expect(write).not.toHaveBeenCalled();
    button('Undo point').click();
    harness.detectChanges();
    click(31, 30.999);
    button('Close outline').click();
    harness.detectChanges();
    expect(page.closed).toBeTrue();
    const markers: L.Marker[] = [];
    map.eachLayer(layer => { if (layer instanceof L.Marker) markers.push(layer); });
    expect(markers.length).toBe(4);
    markers[3].setLatLng([31.0001, 30.999]).fire('dragend');
    harness.detectChanges();
    expect(page.boundary[3].latitude).toBe(31.0001);

    const router = TestBed.inject(Router);
    const navigation = firstValueFrom(router.events.pipe(filter(event => event instanceof NavigationEnd)));
    button('Save field boundary').click();
    await navigation;
    expect(router.url).toBe('/plans/north/satellite');
    const catalog = TestBed.inject(HttpTestingController).expectOne('http://localhost:8080/api/satellite/available-dates');
    catalog.flush({
      status: 'NO_OBSERVATIONS', indicator: 'NDVI', units: 'dimensionless',
      resolutionMeters: 30, fieldAreaSquareMeters: 10000, limitations: 'Catalog coverage varies.', observations: [],
    });
    const stored = JSON.parse(raw);
    expect(stored).toEqual([{ ...growing, fieldBoundary: page.boundary }, other]);
    const reopened = await harness.navigateByUrl(editor, FieldBoundaryComponent);
    expect(reopened.boundary).toEqual(page.boundary);
    expect(reopened.closed).toBeTrue();
    button('Clear outline').click();
    expect(reopened.boundary).toEqual([]);
    expect(JSON.parse(raw)).toEqual(stored);
    const otherPage = await harness.navigateByUrl('/plans/south/satellite/boundary', FieldBoundaryComponent);
    expect(otherPage.boundary).toEqual([]);
    expect(otherPage.plan?.name).toBe(other.name);
  });
});

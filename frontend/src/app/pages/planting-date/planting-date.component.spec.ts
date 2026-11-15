import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { TileLayer } from 'leaflet';
import { routes } from '../../app.routes';
import { PlanDraftService } from '../../services/plan-draft.service';
import { FarmLocationComponent } from '../farm-location/farm-location.component';
import { PlantingDateComponent, localToday, notFutureDate } from './planting-date.component';

describe('Already Planted planting date', () => {
  const path = '/create-plan/growing/planting-date';
  const locationPath = '/create-plan/growing/farm-location';

  beforeEach(async () => {
    spyOn(TileLayer.prototype, 'getTileUrl').and.returnValue('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
    await TestBed.configureTestingModule({ providers: [provideRouter(routes)] }).compileComponents();
  });

  function seed(): PlanDraftService {
    const drafts = TestBed.inject(PlanDraftService);
    drafts.update('already-planted', { name: 'DEMO Growing Field', location: '31.040000, 31.380000', latitude: 31.04, longitude: 31.38 });
    return drafts;
  }

  it('redirects incomplete direct visits to the correct growing step', async () => {
    const harness = await RouterTestingHarness.create(path);
    expect(TestBed.inject(Router).url).toBe('/create-plan/growing/plan-name');
    TestBed.inject(PlanDraftService).update('already-planted', { name: 'DEMO Growing Field' });
    await harness.navigateByUrl(path);
    expect(TestBed.inject(Router).url).toBe(locationPath);
  });

  it('requires a real planting date, rejects future dates and accepts today with no harvest date', async () => {
    seed();
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl(path, PlantingDateComponent);
    component.submit();
    harness.detectChanges();
    expect(harness.routeNativeElement!.textContent).toContain('Choose your actual planting date.');
    expect(document.activeElement).toBe(component.plantingInput.nativeElement);
    component.form.controls.plantingDate.setValue('2026-02-30');
    component.submit();
    harness.detectChanges();
    expect(harness.routeNativeElement!.textContent).toContain('Enter a valid planting date.');
    component.form.controls.plantingDate.setValue('2999-12-31');
    component.submit();
    harness.detectChanges();
    expect(harness.routeNativeElement!.textContent).toContain('Planting date cannot be in the future.');
    expect(component.plantingInput.nativeElement.max).toBe(localToday());
    component.form.controls.plantingDate.setValue(localToday());
    component.submit();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(component.form.valid).toBeTrue();
    expect(harness.routeNativeElement!.textContent).toContain('What crop have you planted?');
    expect(TestBed.inject(Router).url).toBe('/create-plan/growing/current-crop');
  });

  it('validates the optional harvest calendar date and order without blocking future harvests', async () => {
    seed();
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl(path, PlantingDateComponent);
    component.form.setValue({ plantingDate: '2020-02-29', harvestDate: '2020-02-28' });
    component.submit();
    harness.detectChanges();
    expect(harness.routeNativeElement!.textContent).toContain('Harvest date cannot be before planting date.');
    expect(document.activeElement).toBe(component.harvestInput.nativeElement);
    component.form.controls.harvestDate.setValue('2020-02-30');
    component.submit();
    harness.detectChanges();
    expect(harness.routeNativeElement!.textContent).toContain('Enter a valid harvest date.');
    for (const harvestDate of ['', '2020-02-29', '2999-12-31']) {
      component.form.controls.harvestDate.setValue(harvestDate);
      expect(component.form.valid).toBeTrue();
    }
  });

  it('uses local calendar day at midnight rather than UTC day', () => {
    jasmine.clock().install();
    try {
      jasmine.clock().mockDate(new Date(2026, 10, 15, 0, 1));
      expect(localToday()).toBe('2026-11-15');
      expect(notFutureDate(new FormControl('2026-11-15'))).toBeNull();
      expect(notFutureDate(new FormControl('2026-11-16'))).toEqual({ future: true });
      expect(notFutureDate(new FormControl('2026-11-14'))).toBeNull();
    } finally { jasmine.clock().uninstall(); }
  });

  it('keeps growing farm/dates through actual Back/Next and leaves the planning draft untouched', async () => {
    const drafts = seed();
    drafts.update('planning-to-plant', { name: 'DEMO Separate Plan', location: 'Egypt', latitude: 30, longitude: 30 });
    drafts.updatePlantingWindow({ from: '2027-01-01', to: '2027-02-01' });
    drafts.updateComparisonCrops(['carrot', 'tomato']);
    drafts.updateSelectedCrop('carrot');
    const planningBefore = drafts.getPlanningPlan();
    const harness = await RouterTestingHarness.create();
    let component = await harness.navigateByUrl(path, PlantingDateComponent);
    component.form.setValue({ plantingDate: '2020-02-29', harvestDate: '2020-06-01' });
    (harness.routeNativeElement!.querySelector('.footer-content a') as HTMLAnchorElement).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe(locationPath);
    expect(harness.routeNativeElement!.textContent).toContain('31.040000, 31.380000');
    (harness.routeNativeElement!.querySelector('.primary') as HTMLButtonElement).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    component = harness.routeDebugElement!.componentInstance as PlantingDateComponent;
    expect(component.form.getRawValue()).toEqual({ plantingDate: '2020-02-29', harvestDate: '2020-06-01' });
    component.submit();
    await harness.fixture.whenStable();
    expect(drafts.getPlanningPlan()).toEqual(planningBefore);
    expect(drafts.getComparisonCrops()).toEqual(['carrot', 'tomato']);
    const copy = drafts.getAlreadyPlantedDates();
    copy.plantingDate = '';
    expect(drafts.getAlreadyPlantedDates().plantingDate).toBe('2020-02-29');
    component = await harness.navigateByUrl(path, PlantingDateComponent);
    component.form.controls.plantingDate.setValue('');
    await harness.navigateByUrl(locationPath, FarmLocationComponent);
    component = await harness.navigateByUrl(path, PlantingDateComponent);
    expect(component.form.getRawValue()).toEqual({ plantingDate: '', harvestDate: '2020-06-01' });
  });

  for (const [width, height] of [[1440, 900], [1286, 695], [1024, 768], [390, 844]]) {
    it(`keeps the shell fixed and date errors reachable at ${width}x${height}`, async () => {
      seed();
      const harness = await RouterTestingHarness.create();
      const component = await harness.navigateByUrl(path, PlantingDateComponent);
      component.form.setValue({ plantingDate: '2999-12-31', harvestDate: '2026-02-30' });
      component.submit();
      harness.detectChanges();
      const frame = document.createElement('iframe');
      frame.style.cssText = `width:${width}px;height:${height}px;border:0;position:absolute;left:0;top:0`;
      document.body.appendChild(frame);
      try {
        const doc = frame.contentDocument!;
        await Promise.all(Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map(style => {
          const clone = style.cloneNode(true) as HTMLElement;
          const loaded = clone instanceof HTMLLinkElement
            ? new Promise<void>((resolve, reject) => { clone.onload = () => resolve(); clone.onerror = () => reject(new Error('Stylesheet failed')); })
            : Promise.resolve();
          doc.head.appendChild(clone);
          return loaded;
        }));
        doc.body.appendChild(harness.routeNativeElement!);
        await doc.fonts.ready;
        await Promise.all(Array.from(doc.images).map(img => img.decode()));
        expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(width);
        expect(doc.documentElement.scrollHeight).toBeLessThanOrEqual(height);
        const footer = doc.querySelector('footer')!.getBoundingClientRect();
        const header = doc.querySelector('header')!.getBoundingClientRect();
        const progress = doc.querySelector('.step-progress')!.getBoundingClientRect();
        const main = doc.querySelector('main')!;
        main.scrollTop = main.scrollHeight;
        expect(doc.querySelector('#harvest-error')!.getBoundingClientRect().bottom).toBeLessThanOrEqual(main.getBoundingClientRect().bottom);
        expect(doc.querySelector('header')!.getBoundingClientRect().top).toBe(header.top);
        expect(doc.querySelector('.step-progress')!.getBoundingClientRect().top).toBe(progress.top);
        expect(doc.querySelector('footer')!.getBoundingClientRect().top).toBe(footer.top);
      } finally { frame.remove(); }
    });
  }
});

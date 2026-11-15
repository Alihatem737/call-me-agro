import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { PlanDraftService } from '../../services/plan-draft.service';
import { PlanStorageService, PLANS_STORAGE_KEY } from '../../services/plan-storage.service';
import { CurrentCropComponent } from './current-crop.component';
import { PlannedDashboardComponent } from '../planned-dashboard/planned-dashboard.component';

describe('Growing plan save and dashboard', () => {
  let raw: string | null;
  let write: jasmine.Spy;
  const cropPath = '/create-plan/growing/current-crop';

  beforeEach(async () => {
    raw = null;
    spyOn(Storage.prototype, 'getItem').and.callFake(key => key === PLANS_STORAGE_KEY ? raw : null);
    write = spyOn(Storage.prototype, 'setItem').and.callFake((key, value) => { if (key === PLANS_STORAGE_KEY) raw = value; });
    await TestBed.configureTestingModule({ providers: [provideRouter(routes)] }).compileComponents();
  });

  function seed(): PlanDraftService {
    const drafts = TestBed.inject(PlanDraftService);
    drafts.update('already-planted', { name: 'DEMO Growing Field', location: '31.040000, 31.380000', latitude: 31.04, longitude: 31.38 });
    drafts.updateAlreadyPlantedDates({ plantingDate: '2020-02-29', harvestDate: '' });
    drafts.updateAlreadyPlantedCrop('tomato');
    return drafts;
  }

  it('saves once, opens the saved ID and reopens the actual growing crop from My Plans', async () => {
    const drafts = seed();
    drafts.update('planning-to-plant', { name: 'DEMO Planning Field', location: 'Egypt', latitude: 30, longitude: 30 });
    drafts.updatePlantingWindow({ from: '2027-01-01', to: '2027-02-01' });
    drafts.updateComparisonCrops(['carrot']);
    drafts.updateSelectedCrop('carrot');
    const planningBefore = drafts.getPlanningPlan();
    const growing = drafts.getGrowingPlan();
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl(cropPath, CurrentCropComponent);
    component.submit();
    component.submit();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(write).toHaveBeenCalledTimes(1);
    expect(JSON.parse(raw!)).toEqual([growing]);
    expect(TestBed.inject(Router).url).toBe(`/plans/${growing.id}/dashboard`);
    expect(harness.routeNativeElement!.textContent).toContain('CROP GROWING');
    expect(harness.routeNativeElement!.textContent).toContain('Tomato');
    expect(harness.routeNativeElement!.textContent).toContain('Feb 29, 2020');
    expect(harness.routeNativeElement!.textContent).toContain('Not added yet');
    expect(harness.routeNativeElement!.textContent).not.toContain('PLANTING WINDOW');
    expect(harness.routeNativeElement!.textContent).not.toContain('Potato');
    expect(drafts.getPlanningPlan()).toEqual(planningBefore);
    expect(drafts.getGrowingPlan().id).not.toBe(growing.id);
    expect(drafts.getAlreadyPlantedCrop()).toBeNull();
    await harness.navigateByUrl('/my-plans');
    const open = harness.routeNativeElement!.querySelector<HTMLButtonElement>('.open-plan')!;
    expect(open.disabled).toBeFalse();
    open.click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe(`/plans/${growing.id}/dashboard`);
    expect(harness.routeNativeElement!.querySelector('h1')!.textContent).toBe(growing.name);
    expect(new PlanStorageService().loadDashboardPlan(growing.id).plan).toEqual(growing);
  });

  it('retains draft and ID on quota failure and safely retries without duplicating', async () => {
    const drafts = seed();
    const growing = drafts.getGrowingPlan();
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl(cropPath, CurrentCropComponent);
    write.and.throwError('Quota exceeded');
    component.submit();
    harness.detectChanges();
    expect(harness.routeNativeElement!.textContent).toContain('could not be saved');
    expect(component.saving).toBeFalse();
    expect(drafts.getGrowingPlan()).toEqual(growing);
    write.and.callFake((key: string, value: string) => { raw = value; });
    component.submit();
    await harness.fixture.whenStable();
    expect(JSON.parse(raw!).length).toBe(1);
    expect(TestBed.inject(PlanStorageService).save(growing)).toBe('');
    expect(JSON.parse(raw!).length).toBe(1);
  });

  it('rejects incomplete/future plans and preserves corrupt/conflicting storage', () => {
    const plan = seed().getGrowingPlan();
    const storage = TestBed.inject(PlanStorageService);
    for (const invalid of [
      { ...plan, name: '' }, { ...plan, selectedCrop: null }, { ...plan, latitude: 100 },
      { ...plan, plantingDate: '2026-02-30' }, { ...plan, plantingDate: '2999-01-01' },
      { ...plan, harvestDate: '2020-02-28' },
    ]) expect(storage.save(invalid)).not.toBe('');
    expect(write).not.toHaveBeenCalled();
    raw = '{';
    expect(storage.save(plan)).not.toBe('');
    expect(raw).toBe('{');
    raw = JSON.stringify([{ ...plan, name: 'Existing' }]);
    expect(storage.save(plan)).not.toBe('');
    expect(write).not.toHaveBeenCalled();
  });

  it('handles missing and malformed growing IDs, retries and switches between saved crops', async () => {
    const plan = seed().getGrowingPlan();
    const second = { ...plan, id: 'second-growing', name: 'DEMO Onion Field', selectedCrop: 'onion', harvestDate: '2020-06-01' };
    raw = JSON.stringify([plan, second]);
    const harness = await RouterTestingHarness.create('/plans/missing/dashboard');
    expect(harness.routeNativeElement!.textContent).toContain('Plan not found');
    await harness.navigateByUrl(`/plans/${plan.id}/dashboard`);
    expect(harness.routeNativeElement!.textContent).toContain('Tomato');
    const component = await harness.navigateByUrl('/plans/second-growing/dashboard', PlannedDashboardComponent);
    expect(harness.routeNativeElement!.textContent).toContain('Onion');
    expect(harness.routeNativeElement!.textContent).toContain('Jun 1, 2020');
    expect(harness.routeNativeElement!.textContent).not.toContain('Tomato');
    raw = JSON.stringify([{ ...second, plantingDate: '2999-01-01' }]);
    component.reload();
    harness.detectChanges();
    expect(harness.routeNativeElement!.textContent).toContain('Plan unavailable');
    raw = JSON.stringify([second]);
    component.reload();
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('h1')!.textContent).toBe(second.name);
    expect(write).not.toHaveBeenCalled();
  });

  for (const [width, height] of [[1286, 695], [390, 844]]) {
    it(`keeps Growing Dashboard internally scrollable at ${width}x${height}`, async () => {
      const plan = seed().getGrowingPlan();
      raw = JSON.stringify([plan]);
      const harness = await RouterTestingHarness.create(`/plans/${plan.id}/dashboard`);
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
        const header = doc.querySelector('header')!.getBoundingClientRect();
        const main = doc.querySelector('main')!;
        main.scrollTop = main.scrollHeight;
        expect(doc.querySelector('.research')!.getBoundingClientRect().bottom).toBeLessThanOrEqual(main.getBoundingClientRect().bottom);
        expect(doc.querySelector('header')!.getBoundingClientRect().top).toBe(header.top);
        expect(Array.from(doc.querySelectorAll<HTMLButtonElement>('main .tool-buttons button')).every(button => !button.disabled)).toBeTrue();
        expect(doc.querySelector('.mode')!.textContent).toBe('GROWING');
      } finally { frame.remove(); }
    });
  }
});

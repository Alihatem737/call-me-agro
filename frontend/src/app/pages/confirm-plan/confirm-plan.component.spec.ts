import { comparisonProvider } from '../../testing/crop-suitability.fixture';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { PlanDraftService } from '../../services/plan-draft.service';
import { PLANS_STORAGE_KEY, PlanStorageService } from '../../services/plan-storage.service';
import { ConfirmPlanComponent } from './confirm-plan.component';
import { RecommendationsComponent } from '../recommendations/recommendations.component';
import { PlantingWindowComponent } from '../planting-window/planting-window.component';

describe('Confirm Plan', () => {
  const path = '/create-plan/planning/confirm';
  let raw: string | null;
  let write: jasmine.Spy;

  beforeEach(async () => {
    raw = null;
    spyOn(Storage.prototype, 'getItem').and.callFake(key => key === PLANS_STORAGE_KEY ? raw : null);
    write = spyOn(Storage.prototype, 'setItem').and.callFake((key, value) => { if (key === PLANS_STORAGE_KEY) raw = value; });
    await TestBed.configureTestingModule({ providers: [provideRouter(routes), comparisonProvider] }).compileComponents();
  });

  function seed(): PlanDraftService {
    const drafts = TestBed.inject(PlanDraftService);
    drafts.update('planning-to-plant', { name: 'DEMO North Field', location: '31.040000, 31.380000', latitude: 31.04, longitude: 31.38 });
    drafts.updatePlantingWindow({ from: '2026-12-01', to: '2027-01-15' });
    drafts.updateComparisonCrops(['potato', 'tomato']);
    drafts.updateSelectedCrop('tomato');
    return drafts;
  }

  it('shows the actual summary without saving and retains edits through navigation', async () => {
    seed();
    const harness = await RouterTestingHarness.create();
    let component = await harness.navigateByUrl(path, ConfirmPlanComponent);
    const originalId = component.plan.id;
    const text = harness.routeNativeElement!.textContent!;
    expect(text).toContain('DEMO North Field');
    expect(text).toContain('31.040000, 31.380000');
    expect(text).toContain('Dec 1, 2026');
    expect(text).toContain('Jan 15, 2027');
    expect(text).toContain('Tomato');
    expect(write).not.toHaveBeenCalled();
    const editDates = harness.routeNativeElement!.querySelector('a[href$="planting-window"]') as HTMLAnchorElement;
    editDates.click();
    await harness.fixture.whenStable();
    const window = harness.routeDebugElement!.componentInstance as PlantingWindowComponent;
    window.form.setValue({ from: '2026-12-02', to: '2027-02-01' });
    const recommendation = await harness.navigateByUrl('/create-plan/planning/recommendations', RecommendationsComponent);
    recommendation.select('potato');
    recommendation.submit();
    await harness.fixture.whenStable();
    component = harness.routeDebugElement!.componentInstance as ConfirmPlanComponent;
    expect(component.plan.selectedCrop).toBe('potato');
    expect(component.plan.plantingWindow.to).toBe('2027-02-01');
    expect(component.plan.id).toBe(originalId);
    expect(write).not.toHaveBeenCalled();
  });

  it('saves once on double confirmation and displays the plan in My Plans', async () => {
    const drafts = seed();
    drafts.update('already-planted', { name: 'Existing growing draft' });
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl(path, ConfirmPlanComponent);
    const plan = component.plan;
    component.confirm();
    component.confirm();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(write).toHaveBeenCalledTimes(1);
    expect(JSON.parse(raw!)).toEqual([plan]);
    expect(JSON.parse(raw!)[0].selectedCrop).toBe('tomato');
    expect(TestBed.inject(Router).url).toBe(`/plans/${plan.id}/dashboard`);
    expect(harness.routeNativeElement!.querySelector('h1')!.textContent).toBe(plan.name);
    expect(harness.routeNativeElement!.textContent).toContain('Plan saved on this browser');
    await harness.navigateByUrl('/my-plans');
    expect(harness.routeNativeElement!.querySelector('.plan-card h2')!.textContent).toBe(plan.name);
    expect(new PlanStorageService().load().plans[0]).toEqual(plan);
    expect(drafts.getPlanningPlan().id).not.toBe(plan.id);
    expect(drafts.getSelectedCrop()).toBeNull();
    expect(drafts.get('already-planted').name).toBe('Existing growing draft');
  });

  it('keeps the draft after storage failure and permits a safe retry', async () => {
    const drafts = seed();
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl(path, ConfirmPlanComponent);
    write.and.throwError('Quota exceeded');
    component.confirm();
    harness.detectChanges();
    expect(harness.routeNativeElement!.textContent).toContain('could not be saved');
    expect(component.saved).toBeFalse();
    expect(component.saving).toBeFalse();
    expect(drafts.getPlanningPlan().id).toBe(component.plan.id);
    write.and.callFake((key: string, value: string) => { raw = value; });
    component.confirm();
    await harness.fixture.whenStable();
    expect(JSON.parse(raw!).length).toBe(1);
  });

  it('redirects incomplete drafts and refuses invalid or conflicting storage writes', async () => {
    const harness = await RouterTestingHarness.create(path);
    expect(TestBed.inject(Router).url).toBe('/create-plan/planning/plan-name');
    const drafts = seed();
    const plan = drafts.getPlanningPlan();
    const storage = TestBed.inject(PlanStorageService);
    for (const invalid of [
      { ...plan, name: '' }, { ...plan, selectedCrop: null }, { ...plan, latitude: 100 },
      { ...plan, plantingWindow: { from: '2026-02-30', to: '2026-12-01' } },
      { ...plan, plantingWindow: { from: '2026-12-01', to: '2026-12-01' } },
    ]) expect(storage.save(invalid)).not.toBe('');
    expect(write).not.toHaveBeenCalled();
    raw = '{';
    expect(storage.save(plan)).not.toBe('');
    expect(raw).toBe('{');
    raw = JSON.stringify([{ id: 'legacy', name: 'Old field', location: 'Egypt', journey: 'already-planted', extra: 'keep' }]);
    expect(storage.save(plan)).toBe('');
    expect(JSON.parse(raw!)[1].extra).toBe('keep');
    const count = write.calls.count();
    expect(storage.save(plan)).toBe('');
    expect(write.calls.count()).toBe(count);
    expect(storage.save({ ...plan, name: 'Different' })).not.toBe('');
    expect(write.calls.count()).toBe(count);
  });

  for (const [width, height] of [[1286, 695], [390, 844]]) {
    it(`keeps the shell fixed and the full summary reachable at ${width}x${height}`, async () => {
      seed();
      const harness = await RouterTestingHarness.create(path);
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
        const steps = doc.querySelector('.step-progress')!.getBoundingClientRect();
        const main = doc.querySelector('main')!;
        main.scrollTop = main.scrollHeight;
        expect(doc.querySelector('.save-note')!.getBoundingClientRect().bottom).toBeLessThanOrEqual(footer.top);
        expect(doc.querySelector('footer')!.getBoundingClientRect().top).toBe(footer.top);
        expect(doc.querySelector('.step-progress')!.getBoundingClientRect().top).toBe(steps.top);
      } finally { frame.remove(); }
    });
  }
});

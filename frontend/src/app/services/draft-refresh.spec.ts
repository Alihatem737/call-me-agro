import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../app.routes';
import { DRAFT_SESSION_KEY, PlanDraftService } from './plan-draft.service';
import { FarmDetailsComponent } from '../pages/farm-details/farm-details.component';
import { LeavePlanService } from './leave-plan.service';

describe('Draft refresh and leave confirmation', () => {
  beforeEach(async () => {
    sessionStorage.removeItem(DRAFT_SESSION_KEY);
    await TestBed.configureTestingModule({ providers: [provideRouter(routes)] }).compileComponents();
  });
  afterEach(() => { sessionStorage.removeItem(DRAFT_SESSION_KEY); document.querySelectorAll('.leave-plan-dialog').forEach(dialog => dialog.remove()); });

  it('restores both unfinished journeys and stable IDs after refresh without creating saved plans', () => {
    const write = spyOn(localStorage, 'setItem').and.callThrough();
    const draft = TestBed.inject(PlanDraftService);
    draft.update('planning-to-plant', { name: 'Planning field', location: '31,31', latitude: 31, longitude: 31 });
    draft.updatePlantingWindow({ from: '2027-01-01', to: '2027-02-01' });
    draft.updateComparisonCrops(['potato', 'tomato']);
    draft.updateSelectedCrop('tomato');
    draft.update('already-planted', { name: 'Growing field', location: '30,30', latitude: 30, longitude: 30 });
    draft.updateAlreadyPlantedDates({ plantingDate: '2020-01-01', harvestDate: '' });
    draft.updateAlreadyPlantedCrop('carrot');
    const before = [draft.getPlanningPlan(), draft.getGrowingPlan()];
    draft.persistForRefresh();
    const refreshed = new PlanDraftService();
    expect([refreshed.getPlanningPlan(), refreshed.getGrowingPlan()]).toEqual(before);
    expect(refreshed.getComparisonCrops()).toEqual(['potato', 'tomato']);
    expect(write.calls.allArgs().every(([key]) => key === DRAFT_SESSION_KEY)).toBeTrue();
    refreshed.completePlanning();
    expect(new PlanDraftService().get('planning-to-plant').name).toBe('');
  });

  it('ignores corrupt snapshots and rejects unexpected identity fields in restored date data', () => {
    sessionStorage.setItem(DRAFT_SESSION_KEY, '{');
    expect(new PlanDraftService().getSelectedCrop()).toBeNull();
    sessionStorage.setItem(DRAFT_SESSION_KEY, JSON.stringify({ growingId: 'original', alreadyPlantedDates: { id: 'injected', journey: 'injected', plantingDate: '2020-01-01', harvestDate: '' }, comparisonCrops: ['tomato', 'unknown'], selectedCrop: 'potato' }));
    const restored = new PlanDraftService();
    expect(restored.getGrowingPlan().id).toBe('original');
    expect(restored.getGrowingPlan().journey).toBe('already-planted');
    expect(restored.getComparisonCrops()).toEqual(['tomato']);
    expect(restored.getSelectedCrop()).toBeNull();
  });

  it('keeps editing on cancel and discards only the current journey on confirmation', async () => {
    const harness = await RouterTestingHarness.create();
    const page = await harness.navigateByUrl('/create-plan/planning/plan-name', FarmDetailsComponent);
    page.form.controls.name.setValue('Unsaved plan');
    TestBed.inject(PlanDraftService).update('already-planted', { name: 'Keep growing draft' });
    const router = TestBed.inject(Router);
    const cancelled = router.navigateByUrl('/create-plan');
    await new Promise(resolve => setTimeout(resolve, 0));
    (document.querySelector('.leave-plan-dialog .keep') as HTMLButtonElement).click();
    expect(await cancelled).toBeFalse();
    expect(page.form.controls.name.value).toBe('Unsaved plan');
    const discarded = router.navigateByUrl('/create-plan');
    await new Promise(resolve => setTimeout(resolve, 0));
    (document.querySelector('.leave-plan-dialog .discard') as HTMLButtonElement).click();
    expect(await discarded).toBeTrue();
    expect(TestBed.inject(PlanDraftService).get('planning-to-plant').name).toBe('');
    expect(TestBed.inject(PlanDraftService).get('already-planted').name).toBe('Keep growing draft');
  });

  it('shows one leave confirmation when navigation is requested repeatedly', async () => {
    const service = TestBed.inject(LeavePlanService);
    const first = service.confirm('planning-to-plant');
    const second = service.confirm('planning-to-plant');
    expect(first).toBe(second);
    expect(document.querySelectorAll('.leave-plan-dialog').length).toBe(1);
    (document.querySelector('.leave-plan-dialog .keep') as HTMLButtonElement).click();
    expect(await first).toBeFalse();
    expect(await second).toBeFalse();
  });
});

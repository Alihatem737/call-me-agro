import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { CropReport, ReportStatus } from '../../models/crop-report';
import { CropReportStorageService, REPORTS_STORAGE_KEY } from '../../services/crop-report-storage.service';
import { PLANS_STORAGE_KEY } from '../../services/plan-storage.service';
import { ReportProblemComponent } from '../../components/report-problem/report-problem.component';
import { PlannedDashboardComponent } from './planned-dashboard.component';

describe('Problem status tracking', () => {
  const base = { name: 'Test field', location: 'Egypt', latitude: 31, longitude: 31 };
  const planned = { ...base, id: 'planned', journey: 'planning-to-plant', status: 'planned', selectedCrop: 'potato', plantingWindow: { from: '2027-01-01', to: '2027-02-01' } };
  const growing = { ...base, id: 'growing', journey: 'already-planted', status: 'growing', selectedCrop: 'tomato', plantingDate: '2020-02-29', harvestDate: '' };
  const initial: CropReport[] = [
    { id: 'a', planId: 'planned', crop: 'potato', symptom: 'leaf-spots', createdAt: '2026-01-01T00:00:00Z', status: 'not-resolved' },
    { id: 'b', planId: 'planned', crop: 'potato', symptom: 'wilting', createdAt: '2026-01-02T00:00:00Z', status: 'open' },
    { id: 'c', planId: 'growing', crop: 'tomato', symptom: 'yellowing-leaves', createdAt: '2026-01-03T00:00:00Z', status: 'resolved' },
  ];
  let data: Record<string, string>;
  let write: jasmine.Spy;
  beforeEach(async () => {
    data = { [PLANS_STORAGE_KEY]: JSON.stringify([planned, growing]), [REPORTS_STORAGE_KEY]: JSON.stringify(initial) };
    spyOn(Storage.prototype, 'getItem').and.callFake(key => data[key] ?? null);
    write = spyOn(Storage.prototype, 'setItem').and.callFake((key, value) => { data[key] = value; });
    await TestBed.configureTestingModule({ providers: [provideRouter(routes)] }).compileComponents();
  });

  it('changes multiple reports independently through all statuses and retains IDs and plan isolation after reopening', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/plans/planned/dashboard', PlannedDashboardComponent);
    const selects = () => harness.routeNativeElement!.querySelectorAll<HTMLSelectElement>('.report-status');
    expect(selects().length).toBe(2);
    expect(selects()[0].value).toBe('open');
    expect(write).not.toHaveBeenCalled();
    for (const [index, status] of [[0, 'in-progress'], [1, 'resolved'], [0, 'resolved'], [0, 'open']] as [number, ReportStatus][]) {
      selects()[index].value = status;
      selects()[index].dispatchEvent(new Event('change'));
      harness.detectChanges();
      expect(selects()[index].value).toBe(status);
      const stored: CropReport[] = JSON.parse(data[REPORTS_STORAGE_KEY]);
      expect(stored.length).toBe(3);
      expect(stored[2]).toEqual(initial[2]);
      stored.forEach((report, i) => expect({ ...report, status: initial[i].status }).toEqual(initial[i]));
    }
    await harness.navigateByUrl('/plans/growing/dashboard');
    expect(selects().length).toBe(1);
    expect(selects()[0].value).toBe('resolved');
    await harness.navigateByUrl('/my-plans');
    await harness.navigateByUrl('/plans/planned/dashboard');
    expect(Array.from(selects()).map(select => select.value)).toEqual(['open', 'resolved']);
    expect(data[PLANS_STORAGE_KEY]).toBe(JSON.stringify([planned, growing]));
  });

  it('restores the previous UI and stored status on write failure and permits retry', async () => {
    const harness = await RouterTestingHarness.create();
    const dashboard = await harness.navigateByUrl('/plans/planned/dashboard', PlannedDashboardComponent);
    const before = data[REPORTS_STORAGE_KEY];
    const select = harness.routeNativeElement!.querySelector<HTMLSelectElement>('.report-status')!;
    write.and.throwError('Quota exceeded');
    select.value = 'resolved';
    select.dispatchEvent(new Event('change'));
    harness.detectChanges();
    expect(select.value).toBe('open');
    expect(dashboard.reportResult.reports[0].status).toBe('not-resolved');
    expect(data[REPORTS_STORAGE_KEY]).toBe(before);
    expect(harness.routeNativeElement!.textContent).toContain('previous status has been kept');
    write.and.callFake((key, value) => { data[key] = value; });
    select.value = 'in-progress';
    select.dispatchEvent(new Event('change'));
    harness.detectChanges();
    expect(select.value).toBe('in-progress');
    expect(harness.routeNativeElement!.querySelector('.report-error')).toBeNull();
  });

  it('rejects mismatched identities, invalid statuses and corrupt data without writing', () => {
    const service = TestBed.inject(CropReportStorageService);
    expect(service.updateStatus('growing', 'tomato', 'a', 'resolved')).toBeTruthy();
    expect(service.updateStatus('planned', 'tomato', 'a', 'resolved')).toBeTruthy();
    expect(service.updateStatus('missing', 'potato', 'a', 'resolved')).toBeTruthy();
    expect(service.updateStatus('planned', 'potato', 'missing', 'resolved')).toBeTruthy();
    expect(service.updateStatus('planned', 'potato', 'a', 'invalid' as ReportStatus)).toBeTruthy();
    data[REPORTS_STORAGE_KEY] = '{';
    expect(service.updateStatus('planned', 'potato', 'a', 'resolved')).toBeTruthy();
    expect(data[REPORTS_STORAGE_KEY]).toBe('{');
    expect(write).not.toHaveBeenCalled();
  });

  for (const [width, height] of [[1286, 695], [390, 844]]) {
    it(`keeps multiple report controls accessible with internal scrolling at ${width}x${height}`, async () => {
      const harness = await RouterTestingHarness.create('/plans/planned/dashboard');
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
        doc.body.appendChild(harness.routeNativeElement!.cloneNode(true));
        await doc.fonts.ready;
        await Promise.all(Array.from(doc.images).map(image => image.decode()));
        const main = doc.querySelector('main')!;
        const header = doc.querySelector('app-plan-header')!;
        const headerTop = header.getBoundingClientRect().top;
        expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(width);
        expect(doc.documentElement.scrollHeight).toBeLessThanOrEqual(height);
        expect(main.scrollHeight).toBeGreaterThan(main.clientHeight);
        for (const control of Array.from(doc.querySelectorAll<HTMLElement>('.report-status, .view-report'))) {
          main.scrollTop += control.getBoundingClientRect().bottom - main.getBoundingClientRect().bottom;
          const bounds = control.getBoundingClientRect();
          expect(bounds.left).toBeGreaterThanOrEqual(0);
          expect(bounds.right).toBeLessThanOrEqual(width);
          expect(bounds.bottom).toBeLessThanOrEqual(main.getBoundingClientRect().bottom + 1);
          expect(bounds.top).toBeGreaterThanOrEqual(main.getBoundingClientRect().top);
        }
        expect(header.getBoundingClientRect().top).toBe(headerTop);
      } finally { frame.remove(); }
    });
  }

  it('reopens saved details and available guidance in the same modal without saving another report', async () => {
    const harness = await RouterTestingHarness.create();
    const dashboard = await harness.navigateByUrl('/plans/planned/dashboard', PlannedDashboardComponent);
    for (let index = 0; index < 2; index++) {
      harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('.view-report')[index].click();
      harness.detectChanges();
      const modal = harness.routeDebugElement!.query(By.directive(ReportProblemComponent)).componentInstance as ReportProblemComponent;
      expect(modal.step).toBe(2);
      expect(modal.savedReport!.id).toBe(initial[index].id);
      const dialog = harness.routeNativeElement!.querySelector('dialog')!;
      expect(dialog.textContent).toContain(index === 0 ? 'Remove affected leaves' : 'Check the roots and soil');
      expect(dialog.textContent).toContain('Open');
      modal.save();
      modal.select('visible-insects');
      expect(modal.selected).toBe(initial[index].symptom);
      modal.back();
      harness.detectChanges();
      expect(dashboard.reportOpen).toBeFalse();
    }
    await harness.navigateByUrl('/plans/growing/dashboard');
    harness.routeNativeElement!.querySelector<HTMLButtonElement>('.view-report')!.click();
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('dialog')!.textContent).toContain('Return to resolved issue');
    await harness.navigateByUrl('/plans/planned/dashboard');
    expect(dashboard.viewingReport).toBeNull();
    expect(write).not.toHaveBeenCalled();
    expect(data[REPORTS_STORAGE_KEY]).toBe(JSON.stringify(initial));
  });
});

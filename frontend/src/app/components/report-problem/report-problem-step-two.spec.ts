import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { REPORT_SYMPTOMS } from '../../models/crop-report';
import { PLANS_STORAGE_KEY } from '../../services/plan-storage.service';
import { CropReportStorageService, REPORTS_STORAGE_KEY } from '../../services/crop-report-storage.service';
import { ReportProblemComponent } from './report-problem.component';
import { PlannedDashboardComponent } from '../../pages/planned-dashboard/planned-dashboard.component';

describe('Report a Problem Step 2 and saving', () => {
  const base = { name: 'DEMO Field', location: 'Egypt', latitude: 31, longitude: 31 };
  const planned = { ...base, id: 'planned', journey: 'planning-to-plant', status: 'planned', selectedCrop: 'potato', plantingWindow: { from: '2027-01-01', to: '2027-02-01' } };
  const growing = { ...base, id: 'growing', journey: 'already-planted', status: 'growing', selectedCrop: 'tomato', plantingDate: '2020-02-29', harvestDate: '' };
  const expectedTitles = [
    ['Remove affected leaves', 'Improve watering and airflow', 'Monitor the spread'],
    ['Check soil moisture', 'Check plant nutrition', 'Inspect for pests'],
    ['Check the roots and soil', 'Correct irrigation problems', 'Inspect for disease signs'],
    ['Review growing conditions', 'Check soil fertility', 'Remove competition'],
    ['Inspect affected areas', 'Improve field conditions', 'Prevent further damage'],
    ['Identify the insect', 'Use non-chemical controls first', 'Monitor and seek appropriate control'],
  ];
  let data: Record<string, string>;
  let write: jasmine.Spy;

  beforeEach(async () => {
    data = { [PLANS_STORAGE_KEY]: JSON.stringify([planned, growing]) };
    spyOn(Storage.prototype, 'getItem').and.callFake(key => data[key] ?? null);
    write = spyOn(Storage.prototype, 'setItem').and.callFake((key, value) => { data[key] = value; });
    await TestBed.configureTestingModule({ providers: [provideRouter(routes)] }).compileComponents();
  });

  async function open(planId: string) {
    const harness = await RouterTestingHarness.create();
    const dashboard = await harness.navigateByUrl(`/plans/${planId}/dashboard`, PlannedDashboardComponent);
    (harness.routeNativeElement!.querySelector('.report-problem') as HTMLButtonElement).click();
    harness.detectChanges();
    const modal = harness.routeDebugElement!.query(By.directive(ReportProblemComponent)).componentInstance as ReportProblemComponent;
    return { harness, dashboard, modal };
  }

  for (const [index, symptom] of REPORT_SYMPTOMS.entries()) {
    it(`completes and saves ${symptom.name} once with correct context and Back retention`, async () => {
      const plan = index % 2 === 0 ? planned : growing;
      const { harness, modal } = await open(plan.id);
      modal.select(symptom.id);
      modal.next();
      harness.detectChanges();
      let dialog = harness.routeNativeElement!.querySelector('dialog')!;
      expect(dialog.querySelector('h2')!.textContent).toContain(symptom.name);
      expect(dialog.querySelector('.badge')!.textContent).toBe('General guidance');
      expect(dialog.querySelectorAll('.guidance li').length).toBe(3);
      expect(Array.from(dialog.querySelectorAll('.guidance h3')).map(item => item.textContent)).toEqual(expectedTitles[index]);
      expect(Array.from(dialog.querySelectorAll('.number')).map(item => item.textContent)).toEqual(['01', '02', '03']);
      expect(dialog.querySelector('#report-help')!.textContent).toBe('These are general management steps, not a confirmed diagnosis.');
      expect(dialog.textContent).not.toContain('Guidance not available yet');
      expect(write).not.toHaveBeenCalled();
      (dialog.querySelector('footer button') as HTMLButtonElement).click();
      harness.detectChanges();
      expect(modal.step).toBe(1);
      expect(harness.routeNativeElement!.querySelector<HTMLInputElement>('input:checked')!.value).toBe(symptom.id);
      modal.next();
      harness.detectChanges();
      dialog = harness.routeNativeElement!.querySelector('dialog')!;
      (dialog.querySelector('.next') as HTMLButtonElement).click();
      modal.save();
      await new Promise(resolve => setTimeout(resolve, 0));
      harness.detectChanges();
      expect(write).toHaveBeenCalledTimes(1);
      const saved = JSON.parse(data[REPORTS_STORAGE_KEY]);
      expect(saved.length).toBe(1);
      expect(saved[0].planId).toBe(plan.id);
      expect(saved[0].crop).toBe(plan.selectedCrop);
      expect(saved[0].symptom).toBe(symptom.id);
      expect(saved[0].status).toBe('open');
      expect(saved[0].id).toBeTruthy();
      expect(harness.routeNativeElement!.querySelector('.saved-reports')!.textContent).toContain(symptom.name);
      expect(TestBed.inject(Router).url).toBe(`/plans/${plan.id}/dashboard`);
      expect(data[PLANS_STORAGE_KEY]).toBe(JSON.stringify([planned, growing]));
      const storage = TestBed.inject(CropReportStorageService);
      expect(storage.save(saved[0])).toBe('');
      expect(write).toHaveBeenCalledTimes(1);
      expect(storage.load(plan.id, plan.selectedCrop as 'potato' | 'tomato').reports.length).toBe(1);
      await harness.navigateByUrl(`/plans/${plan.id === 'planned' ? 'growing' : 'planned'}/dashboard`);
      expect(harness.routeNativeElement!.querySelector('.saved-reports')!.textContent).not.toContain(symptom.name);
      await harness.navigateByUrl(`/plans/${plan.id}/dashboard`);
      expect(harness.routeNativeElement!.querySelector('.saved-reports')!.textContent).toContain(symptom.name);
      const beforeReopen = data[REPORTS_STORAGE_KEY];
      harness.routeNativeElement!.querySelector<HTMLButtonElement>('.view-report')!.click();
      harness.detectChanges();
      dialog = harness.routeNativeElement!.querySelector('dialog')!;
      expect(Array.from(dialog.querySelectorAll('.guidance h3')).map(item => item.textContent)).toEqual(expectedTitles[index]);
      expect(dialog.querySelector('.saved-details')!.textContent).toContain('Open');
      expect(data[REPORTS_STORAGE_KEY]).toBe(beforeReopen);
      (dialog.querySelector('.close') as HTMLButtonElement).click();
    });
  }

  it('retains Step 2 after write failure and safely retries without replacing existing reports', async () => {
    data[REPORTS_STORAGE_KEY] = JSON.stringify([{ id: 'previous-report', planId: 'planned', crop: 'potato', symptom: 'leaf-spots', createdAt: '2020-01-01T00:00:00Z', status: 'not-resolved' }]);
    const { harness, modal } = await open('growing');
    modal.select('wilting');
    modal.next();
    write.and.throwError('Quota exceeded');
    modal.save();
    harness.detectChanges();
    expect(modal.saved).toBeFalse();
    expect(modal.saving).toBeFalse();
    expect(modal.step).toBe(2);
    expect(modal.selected).toBe('wilting');
    expect(harness.routeNativeElement!.textContent).toContain('could not be saved');
    write.and.callFake((key: string, value: string) => { data[key] = value; });
    modal.save();
    await new Promise(resolve => setTimeout(resolve, 0));
    harness.detectChanges();
    expect(JSON.parse(data[REPORTS_STORAGE_KEY]).length).toBe(2);
    expect(JSON.parse(data[REPORTS_STORAGE_KEY])[1].id).toBe('previous-report');
  });

  it('blocks corrupt report storage and changed crop context without writing or losing selection', async () => {
    const { harness, modal } = await open('growing');
    modal.select('slow-growth');
    modal.next();
    data[REPORTS_STORAGE_KEY] = '{';
    modal.save();
    expect(modal.error).toContain('could not be read safely');
    expect(data[REPORTS_STORAGE_KEY]).toBe('{');
    expect(write).not.toHaveBeenCalled();
    delete data[REPORTS_STORAGE_KEY];
    data[PLANS_STORAGE_KEY] = JSON.stringify([{ ...growing, selectedCrop: 'carrot' }]);
    modal.save();
    expect(modal.error).toContain('no longer available');
    expect(write).not.toHaveBeenCalled();
    modal.close();
    await new Promise(resolve => setTimeout(resolve, 0));
    harness.detectChanges();
  });

  for (const [width, height] of [[1286, 695], [1440, 900], [390, 844]]) {
    for (const symptom of REPORT_SYMPTOMS) {
    it(`keeps ${symptom.id} guidance and save accessible at ${width}x${height}`, async () => {
      const { harness, modal } = await open('planned');
      modal.select(symptom.id);
      modal.next();
      harness.detectChanges();
      const original = harness.routeNativeElement!.querySelector('dialog') as HTMLDialogElement;
      const clone = original.cloneNode(true) as HTMLDialogElement;
      clone.removeAttribute('open');
      original.close();
      const frame = document.createElement('iframe');
      frame.style.cssText = `width:${width}px;height:${height}px;border:0;position:absolute;left:0;top:0`;
      document.body.appendChild(frame);
      try {
        const doc = frame.contentDocument!;
        await Promise.all(Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map(style => {
          const styleClone = style.cloneNode(true) as HTMLElement;
          const loaded = styleClone instanceof HTMLLinkElement
            ? new Promise<void>((resolve, reject) => { styleClone.onload = () => resolve(); styleClone.onerror = () => reject(new Error('Stylesheet failed')); })
            : Promise.resolve();
          doc.head.appendChild(styleClone);
          return loaded;
        }));
        doc.body.appendChild(clone);
        clone.showModal();
        await doc.fonts.ready;
        await Promise.all(Array.from(doc.images).map(img => img.decode()));
        const bounds = clone.getBoundingClientRect();
        expect(bounds.right).toBeLessThanOrEqual(width);
        expect(bounds.bottom).toBeLessThanOrEqual(height);
        expect(clone.scrollWidth).toBeLessThanOrEqual(clone.clientWidth);
        const footer = clone.querySelector('footer')!.getBoundingClientRect();
        const content = clone.querySelector('.content')!;
        content.scrollTop = content.scrollHeight;
        expect(clone.querySelector('.guidance')!.getBoundingClientRect().bottom).toBeLessThanOrEqual(footer.top);
        expect(content.scrollWidth).toBeLessThanOrEqual(content.clientWidth);
        const guidance = clone.querySelector('.guidance')!.getBoundingClientRect();
        const contentBounds = content.getBoundingClientRect();
        expect(guidance.bottom).toBeLessThanOrEqual(contentBounds.bottom);
        if (content.scrollHeight > content.clientHeight) {
          expect(contentBounds.bottom - guidance.bottom).toBeLessThanOrEqual(21);
        }
        for (const image of Array.from(doc.images)) {
          expect(image.naturalWidth).toBeGreaterThan(0);
          const imageBounds = image.getBoundingClientRect();
          expect(imageBounds.width).toBe(19);
          expect(imageBounds.height).toBe(19);
        }
        expect(clone.querySelector('footer')!.getBoundingClientRect().top).toBe(footer.top);
        clone.close();
      } finally { frame.remove(); await new Promise(resolve => setTimeout(resolve, 0)); harness.detectChanges(); }
    });
    }
  }
});

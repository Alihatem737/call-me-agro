import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { PlannedDashboardComponent } from '../../pages/planned-dashboard/planned-dashboard.component';
import { BiologicComponent } from '../../pages/biologic/biologic.component';
import { CareLogService, CARE_LOG_KEY } from '../../services/care-log.service';
import { PlanStorageService, PLANS_STORAGE_KEY } from '../../services/plan-storage.service';
import { DashboardToolComponent } from './dashboard-tool.component';
import { CareEntry } from '../../models/care-entry';

describe('Completed Dashboard tools', () => {
  const base = { name: 'Test field', location: 'Egypt', latitude: 31, longitude: 31 };
  const planned = { ...base, id: 'planned', journey: 'planning-to-plant', status: 'planned', selectedCrop: 'potato', plantingWindow: { from: '2027-01-01', to: '2027-02-01' } };
  const growing = { ...base, id: 'growing', journey: 'already-planted', status: 'growing', selectedCrop: 'tomato', plantingDate: '2020-02-29', harvestDate: '' } as const;
  let data: Record<string, string>;
  let write: jasmine.Spy;
  beforeEach(async () => {
    data = { [PLANS_STORAGE_KEY]: JSON.stringify([planned, growing]) };
    spyOn(Storage.prototype, 'getItem').and.callFake(key => data[key] ?? null);
    write = spyOn(Storage.prototype, 'setItem').and.callFake((key, value) => { data[key] = value; });
    await TestBed.configureTestingModule({ providers: [provideRouter(routes)] }).compileComponents();
  });

  async function open(id: string, tool: 'calculator' | 'log' | 'dates' | 'start') {
    const harness = await RouterTestingHarness.create();
    const dashboard = await harness.navigateByUrl(`/plans/${id}/dashboard`, PlannedDashboardComponent);
    dashboard.openTool(tool);
    harness.detectChanges();
    const modal = harness.routeDebugElement!.query(By.directive(DashboardToolComponent)).componentInstance as DashboardToolComponent;
    return { harness, dashboard, modal };
  }

  for (const id of ['planned', 'growing']) {
    it(`validates calculator inputs for ${id} and never returns actionable chemical quantities`, async () => {
      const { harness, modal } = await open(id, 'calculator');
      expect(harness.routeNativeElement!.querySelector('button[form="tool-form"]')!.textContent).toContain('Check label requirements');
      expect(harness.routeNativeElement!.querySelector('dialog')!.textContent).toContain(id === 'planned' ? 'Potato' : 'Tomato');
      modal.submit();
      expect(modal.result).toBeFalse();
      expect(modal.error).toContain('positive field area');
      modal.calculator.setValue({ area: -1, rate: 'User label text' });
      modal.submit();
      expect(modal.result).toBeFalse();
      modal.calculator.setValue({ area: 0.5, rate: 'User label text with units' });
      modal.submit();
      harness.detectChanges();
      expect(modal.result).toBeTrue();
      expect(harness.routeNativeElement!.querySelector('dialog')!.textContent).toContain('No chemical quantity is calculated or recommended');
      expect(harness.routeNativeElement!.querySelector('dialog')!.textContent).toContain('DEMO');
      expect(write).not.toHaveBeenCalled();
      modal.result = false;
      expect(modal.calculator.controls.area.value).toBe(0.5);
      modal.close();
    });

    it(`adds, views and updates ${id} care entries once, preserving other plans through fresh reads`, async () => {
      const { harness, dashboard, modal } = await open(id, 'log');
      modal.submit();
      expect(modal.error).toContain('Complete');
      modal.log.setValue({ type: 'spray', date: '2020-01-01', product: 'Recorded product', amount: '1 L' });
      modal.submit();
      modal.submit();
      harness.detectChanges();
      expect(write).toHaveBeenCalledTimes(1);
      expect(modal.success).toBeTrue();
      const entry: CareEntry = JSON.parse(data[CARE_LOG_KEY])[0];
      expect(entry.planId).toBe(id);
      expect(entry.crop).toBe(id === 'planned' ? 'potato' : 'tomato');
      modal.close();
      harness.detectChanges();
      expect(harness.routeNativeElement!.querySelector('.care-log')!.textContent).toContain('Recorded product');
      dashboard.openTool('log', entry);
      harness.detectChanges();
      const viewer = harness.routeDebugElement!.query(By.directive(DashboardToolComponent)).componentInstance as DashboardToolComponent;
      expect(viewer.viewing).toBeTrue();
      viewer.submit();
      expect(write).toHaveBeenCalledTimes(1);
      viewer.edit();
      viewer.log.controls.amount.setValue('2 L');
      viewer.submit();
      expect(viewer.success).toBeTrue();
      const saved: CareEntry[] = JSON.parse(data[CARE_LOG_KEY]);
      expect(saved.length).toBe(1);
      expect(saved[0]).toEqual({ ...entry, amount: '2 L' });
      viewer.close();
      harness.detectChanges();
      await harness.navigateByUrl(`/plans/${id === 'planned' ? 'growing' : 'planned'}/dashboard`);
      expect(harness.routeNativeElement!.querySelector('.care-log')!.textContent).toContain('No care entries');
      await harness.navigateByUrl('/my-plans');
      await harness.navigateByUrl(`/plans/${id}/dashboard`);
      expect(harness.routeNativeElement!.querySelector('.care-log')!.textContent).toContain('2 L');
      expect(data[PLANS_STORAGE_KEY]).toBe(JSON.stringify([planned, growing]));
    });
  }

  it('keeps failed care edits and old data for retry and rejects invalid entries', async () => {
    const { harness, modal } = await open('growing', 'log');
    for (const values of [
      { type: 'spray', date: '2099-01-01', product: 'Product', amount: '1 L' },
      { type: 'spray', date: '2020-02-30', product: 'Product', amount: '1 L' },
      { type: 'fertilizer', date: '2020-01-01', product: '   ', amount: '1 L' },
      { type: 'fertilizer', date: '2020-01-01', product: 'Product', amount: '-1' },
      { type: 'invalid', date: '2020-01-01', product: 'Product', amount: '1 L' },
    ]) { modal.log.setValue(values); modal.submit(); expect(modal.success).toBeFalse(); }
    expect(write).not.toHaveBeenCalled();
    modal.log.setValue({ type: 'fertilizer', date: '2020-01-01', product: 'Recorded product', amount: '1 kg' });
    write.and.throwError('Quota');
    modal.submit();
    harness.detectChanges();
    expect(modal.error).toContain('could not save');
    expect(modal.log.controls.product.value).toBe('Recorded product');
    expect(data[CARE_LOG_KEY]).toBeUndefined();
    write.and.callFake((key, value) => { data[key] = value; });
    modal.submit();
    expect(modal.success).toBeTrue();
    expect(JSON.parse(data[CARE_LOG_KEY]).length).toBe(1);
    modal.close();
  });

  it('blocks corrupt logs and cross-plan editing without overwriting stored records', () => {
    const logs = TestBed.inject(CareLogService);
    const entry: CareEntry = { id: 'one', planId: 'planned', crop: 'potato', type: 'spray', date: '2020-01-01', product: 'Recorded product', amount: '1 L', createdAt: '2020-01-01T00:00:00Z' };
    expect(logs.save(entry)).toBe('');
    const raw = data[CARE_LOG_KEY];
    expect(logs.save({ ...entry, planId: 'growing', crop: 'tomato' }, true)).toContain('original entry');
    expect(logs.save({ ...entry, id: 'two', crop: 'tomato' })).toContain('no longer available');
    expect(data[CARE_LOG_KEY]).toBe(raw);
    data[CARE_LOG_KEY] = '{';
    expect(logs.load('planned', 'potato').error).toBeTruthy();
    expect(logs.save({ ...entry, id: 'two' })).toContain('read safely');
    expect(data[CARE_LOG_KEY]).toBe('{');
  });

  it('edits dates safely and starts a planned crop without changing IDs, journey, crop or reports', async () => {
    const storage = TestBed.inject(PlanStorageService);
    expect(storage.updateDates('growing', 'tomato', '2099-01-01', '')).toContain('future');
    expect(storage.updateDates('growing', 'tomato', '2020-01-02', '2020-01-01')).toContain('Harvest');
    expect(storage.updateDates('growing', 'potato', '2020-01-01', '')).toContain('no longer available');
    const { harness, modal } = await open('planned', 'dates');
    modal.dates.setValue({ plantingDate: '2027-01-01', harvestDate: '2027-05-01' });
    modal.submit();
    expect(modal.success).toBeTrue();
    modal.close();
    harness.detectChanges();
    const dashboard = await harness.navigateByUrl('/plans/planned/dashboard', PlannedDashboardComponent);
    dashboard.openTool('start');
    harness.detectChanges();
    const start = harness.routeDebugElement!.query(By.directive(DashboardToolComponent)).componentInstance as DashboardToolComponent;
    start.dates.controls.plantingDate.setValue('2020-01-01');
    start.submit();
    harness.detectChanges();
    expect(start.success).toBeTrue();
    expect(dashboard.growing).toBeTrue();
    const stored = storage.loadDashboardPlan('planned').plan!;
    expect(stored.id).toBe('planned');
    expect(stored.journey).toBe('planning-to-plant');
    expect(stored.selectedCrop).toBe('potato');
    expect(stored.status).toBe('growing');
    expect(storage.loadDashboardPlan('growing').plan).toEqual(growing);
    start.close();
    harness.detectChanges();
    await harness.navigateByUrl('/my-plans');
    expect(harness.routeNativeElement!.querySelectorAll('.plan-photo .badge')[0].textContent).toBe('GROWING');
  });

  it('keeps the old plan after a date write failure and permits optional start date', () => {
    const storage = TestBed.inject(PlanStorageService);
    const before = data[PLANS_STORAGE_KEY];
    write.and.throwError('Quota');
    expect(storage.updateDates('planned', 'potato', '', '', true)).toContain('previous plan');
    expect(data[PLANS_STORAGE_KEY]).toBe(before);
    write.and.callFake((key, value) => { data[key] = value; });
    expect(storage.updateDates('planned', 'potato', '', '', true)).toBe('');
    expect(storage.loadDashboardPlan('planned').plan!.status).toBe('growing');
  });

  for (const [width, height] of [[1286, 695], [1440, 900], [390, 844]]) {
    for (const tool of ['calculator', 'log', 'dates', 'start'] as const) {
      it(`keeps ${tool} validation and footer accessible at ${width}x${height}`, async () => {
        const { harness, modal } = await open('planned', tool);
        if (tool === 'start') modal.dates.controls.plantingDate.setValue('2999-01-01');
        modal.submit();
        harness.detectChanges();
        const original = harness.routeNativeElement!.querySelector('dialog')!;
        const clone = original.cloneNode(true) as HTMLDialogElement;
        clone.removeAttribute('open');
        const frame = document.createElement('iframe');
        frame.style.cssText = `width:${width}px;height:${height}px;border:0;position:absolute;left:0;top:0`;
        document.body.appendChild(frame);
        try {
          const doc = frame.contentDocument!;
          await Promise.all(Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map(style => {
            const copy = style.cloneNode(true) as HTMLElement;
            const ready = copy instanceof HTMLLinkElement ? new Promise<void>((resolve, reject) => { copy.onload = () => resolve(); copy.onerror = () => reject(new Error('Stylesheet failed')); }) : Promise.resolve();
            doc.head.appendChild(copy);
            return ready;
          }));
          doc.body.appendChild(clone);
          clone.showModal();
          await doc.fonts.ready;
          const bounds = clone.getBoundingClientRect();
          expect(bounds.left).toBeGreaterThanOrEqual(0);
          expect(bounds.right).toBeLessThanOrEqual(width);
          expect(bounds.bottom).toBeLessThanOrEqual(height);
          expect(clone.scrollWidth).toBeLessThanOrEqual(clone.clientWidth);
          if (tool === 'start') {
            const form = clone.querySelector('form')!.getBoundingClientRect();
            expect(clone.querySelector('input')!.getBoundingClientRect().width).toBeCloseTo(form.width, 0);
          }
          const footer = clone.querySelector('footer')!.getBoundingClientRect();
          const content = clone.querySelector('.content')!;
          content.scrollTop = content.scrollHeight;
          expect(clone.querySelector('footer')!.getBoundingClientRect().top).toBe(footer.top);
          const last = content.lastElementChild!.getBoundingClientRect();
          expect(last.bottom).toBeLessThanOrEqual(footer.top + 1);
          expect(doc.documentElement.scrollHeight).toBeLessThanOrEqual(height);
          clone.close();
        } finally { frame.remove(); modal.close(); harness.detectChanges(); }
      });
    }
  }

  for (const [width, height] of [[1286, 695], [1440, 900], [390, 844]]) {
    it(`keeps Arabic article text and navigation reachable at ${width}x${height}`, async () => {
      const harness = await RouterTestingHarness.create('/plans/growing/biologic');
      const frame = document.createElement('iframe');
      frame.style.cssText = `width:${width}px;height:${height}px;border:0;position:absolute;left:0;top:0`;
      document.body.appendChild(frame);
      try {
        const doc = frame.contentDocument!;
        await Promise.all(Array.from(document.querySelectorAll('style, link[rel="stylesheet"]')).map(style => {
          const copy = style.cloneNode(true) as HTMLElement;
          const ready = copy instanceof HTMLLinkElement ? new Promise<void>((resolve, reject) => { copy.onload = () => resolve(); copy.onerror = () => reject(new Error('Stylesheet failed')); }) : Promise.resolve();
          doc.head.appendChild(copy);
          return ready;
        }));
        doc.body.appendChild(harness.routeNativeElement!.cloneNode(true));
        await doc.fonts.ready;
        await Promise.all(Array.from(doc.images).map(image => image.decode()));
        const main = doc.querySelector('main')!;
        expect(getComputedStyle(main).direction).toBe('rtl');
        expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(width);
        expect(doc.documentElement.scrollHeight).toBeLessThanOrEqual(height);
        expect(main.scrollWidth).toBeLessThanOrEqual(main.clientWidth);
        const brand = doc.querySelector('.brand')!.getBoundingClientRect();
        const back = doc.querySelector('.back')!.getBoundingClientRect();
        expect(brand.right).toBeLessThanOrEqual(back.left);
        for (const section of Array.from(main.querySelectorAll<HTMLElement>('.body-copy > section, aside, .hero-copy'))) {
          expect(section.scrollWidth).toBeLessThanOrEqual(section.clientWidth);
        }
        main.scrollTop = main.scrollHeight;
        expect(main.querySelector('footer')!.getBoundingClientRect().bottom).toBeLessThanOrEqual(main.getBoundingClientRect().bottom + 1);
      } finally { frame.remove(); }
    });
  }

  it('loads the Arabic article by Plan ID with exact sections, safety notices and a working Dashboard return', async () => {
    const harness = await RouterTestingHarness.create();
    const article = await harness.navigateByUrl('/plans/growing/biologic', BiologicComponent);
    expect(article.result.plan!.selectedCrop).toBe('tomato');
    const main = harness.routeNativeElement!.querySelector('main')!;
    expect(main.dir).toBe('rtl');
    expect(main.lang).toBe('ar');
    expect(main.querySelectorAll('.body-copy > section').length).toBe(9);
    expect(main.textContent).toContain('تصور تجريبي غير مثبت');
    expect(main.querySelectorAll('.logic > div').length).toBe(2);
    expect(main.querySelectorAll('#references a').length).toBe(2);
    expect(harness.routeNativeElement!.querySelector('.back')!.getAttribute('href')).toBe('/plans/growing/dashboard');
    await harness.navigateByUrl('/plans/invalid/biologic');
    expect(harness.routeNativeElement!.textContent).toContain('الخطة غير موجودة');
    expect(harness.routeNativeElement!.querySelector('.hero')).toBeNull();
    expect(write).not.toHaveBeenCalled();
  });
});

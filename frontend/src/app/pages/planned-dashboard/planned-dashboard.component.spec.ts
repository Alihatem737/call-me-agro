import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { PlannedPlan } from '../../models/planned-plan';
import { PLANS_STORAGE_KEY, PlanStorageService } from '../../services/plan-storage.service';
import { PlannedDashboardComponent } from './planned-dashboard.component';

describe('Planned Dashboard', () => {
  const potato: PlannedPlan = {
    id: 'potato-plan', name: 'DEMO North Field', location: '31.040000, 31.380000',
    journey: 'planning-to-plant', latitude: 31.04, longitude: 31.38,
    plantingWindow: { from: '2026-12-01', to: '2027-01-15' }, selectedCrop: 'potato', status: 'planned',
  };
  const tomato: PlannedPlan = { ...potato, id: 'tomato-plan', name: 'DEMO Tomato Field', selectedCrop: 'tomato', plantingDate: '2026-12-03', harvestDate: '2027-03-20' };
  let raw: string | null;
  let write: jasmine.Spy;

  beforeEach(async () => {
    raw = JSON.stringify([potato, tomato]);
    spyOn(Storage.prototype, 'getItem').and.callFake(key => key === PLANS_STORAGE_KEY ? raw : null);
    write = spyOn(Storage.prototype, 'setItem');
    await TestBed.configureTestingModule({ providers: [provideRouter(routes)] }).compileComponents();
  });

  it('loads the correct saved plan and updates when the ID changes on the same route', async () => {
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl('/plans/potato-plan/dashboard', PlannedDashboardComponent);
    expect(harness.routeNativeElement!.querySelector('h1')!.textContent).toBe(potato.name);
    expect(harness.routeNativeElement!.textContent).toContain('Potato');
    expect(harness.routeNativeElement!.textContent).toContain('Dec 1, 2026');
    expect(harness.routeNativeElement!.textContent).toContain('Jan 15, 2027');
    expect(harness.routeNativeElement!.textContent).toContain('Not added yet');
    await harness.navigateByUrl('/plans/tomato-plan/dashboard', PlannedDashboardComponent);
    expect(harness.routeNativeElement!.querySelector('h1')!.textContent).toBe(tomato.name);
    expect(harness.routeNativeElement!.textContent).toContain('Tomato');
    expect(harness.routeNativeElement!.textContent).toContain('Dec 3, 2026');
    expect(harness.routeNativeElement!.textContent).toContain('Mar 20, 2027');
    expect(harness.routeNativeElement!.textContent).not.toContain('Potato');
    expect(write).not.toHaveBeenCalled();
  });

  it('opens the correct planned dashboard from My Plans and enables the completed frontend tools', async () => {
    const harness = await RouterTestingHarness.create('/my-plans');
    const buttons = harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('.open-plan');
    expect(buttons[1].disabled).toBeFalse();
    buttons[1].click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/plans/tomato-plan/dashboard');
    expect(Array.from(harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('main .tool-buttons button')).every(button => !button.disabled)).toBeTrue();
    expect(harness.routeNativeElement!.querySelector<HTMLButtonElement>('.report-problem')!.disabled).toBeFalse();
    expect(harness.routeNativeElement!.textContent).toContain('DEMO, no dosage provided');
    expect(write).not.toHaveBeenCalled();
    (harness.routeNativeElement!.querySelector('a[href="/my-plans"]') as HTMLAnchorElement).click();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/my-plans');
    await harness.navigateByUrl('/plans/tomato-plan/dashboard');
    expect(harness.routeNativeElement!.querySelector('h1')!.textContent).toBe(tomato.name);
  });

  it('handles missing IDs, corrupt storage and unsafe/incomplete saved records without changing data', async () => {
    const harness = await RouterTestingHarness.create('/plans/missing/dashboard');
    expect(harness.routeNativeElement!.textContent).toContain('Plan not found');
    raw = '{';
    const component = await harness.navigateByUrl('/plans/potato-plan/dashboard', PlannedDashboardComponent);
    expect(harness.routeNativeElement!.textContent).toContain('Plan unavailable');
    raw = JSON.stringify([potato]);
    component.reload();
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelector('h1')!.textContent).toBe(potato.name);
    for (const invalid of [
      { ...potato, selectedCrop: 'unknown' },
      { ...potato, selectedCrop: null },
      { ...potato, plantingWindow: { from: ['2026-12-01'], to: '2027-01-15' } },
      { id: potato.id, name: 'Legacy', location: 'Egypt', journey: 'planning-to-plant' },
    ]) {
      raw = JSON.stringify([invalid]);
      component.reload();
      harness.detectChanges();
      expect(harness.routeNativeElement!.textContent).toContain('Plan unavailable');
    }
    expect(write).not.toHaveBeenCalled();
  });

  it('rejects invalid optional dates and supports all six saved crop IDs', () => {
    const storage = TestBed.inject(PlanStorageService);
    for (const crop of ['potato', 'tomato', 'onion', 'pepper', 'cucumber', 'carrot'] as const) {
      raw = JSON.stringify([{ ...potato, selectedCrop: crop }]);
      expect(storage.loadPlannedPlan(potato.id).plan?.selectedCrop).toBe(crop);
    }
    const fixture = TestBed.createComponent(PlannedDashboardComponent);
    expect(fixture.componentInstance.dateValue('2026-02-30')).toBeNull();
    expect(fixture.componentInstance.dateValue(123)).toBeNull();
    expect(fixture.componentInstance.dateValue('2026-12-03')).toBe('2026-12-03T00:00:00Z');
  });

  for (const [width, height] of [[1440, 900], [1286, 695], [1024, 768], [390, 844]]) {
    it(`keeps the Navbar fixed and all tools reachable at ${width}x${height}`, async () => {
      const harness = await RouterTestingHarness.create('/plans/potato-plan/dashboard');
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
        expect(frame.contentWindow!.getComputedStyle(main).overflowY).toBe('auto');
        main.scrollTop = main.scrollHeight;
        expect(doc.querySelector('.research')!.getBoundingClientRect().bottom).toBeLessThanOrEqual(main.getBoundingClientRect().bottom);
        expect(doc.querySelector('header')!.getBoundingClientRect().top).toBe(header.top);
        expect(doc.documentElement.scrollTop).toBe(0);
        for (const img of Array.from(doc.querySelectorAll<HTMLImageElement>('main img'))) {
          expect(img.naturalWidth).toBeGreaterThan(0);
          expect(img.getBoundingClientRect().width).toBe(19);
          expect(img.getBoundingClientRect().height).toBe(19);
        }
      } finally { frame.remove(); }
    });
  }
});

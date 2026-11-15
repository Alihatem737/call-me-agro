import { comparisonProvider } from '../../testing/crop-suitability.fixture';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { COMPARISON_CROPS, ComparisonCrop, PlanDraftService } from '../../services/plan-draft.service';
import { ChooseCropsComponent } from '../choose-crops/choose-crops.component';
import { RecommendationsComponent } from './recommendations.component';

describe('Recommendations', () => {
  const path = '/create-plan/planning/recommendations';
  const cropsPath = '/create-plan/planning/choose-crops';

  beforeEach(async () => {
    await TestBed.configureTestingModule({ providers: [provideRouter(routes), comparisonProvider] }).compileComponents();
  });

  function seed(crops: ComparisonCrop[] = ['potato', 'tomato']): PlanDraftService {
    const drafts = TestBed.inject(PlanDraftService);
    drafts.update('planning-to-plant', { name: 'DEMO Field', location: '31.000000, 31.000000', latitude: 31, longitude: 31 });
    drafts.updatePlantingWindow({ from: '2026-12-01', to: '2027-01-15' });
    drafts.updateComparisonCrops(crops);
    return drafts;
  }

  it('redirects direct visits with incomplete farm, dates or crop selection', async () => {
    const harness = await RouterTestingHarness.create(path);
    expect(TestBed.inject(Router).url).toBe('/create-plan/planning/plan-name');
    const drafts = seed([]);
    await harness.navigateByUrl(path);
    expect(TestBed.inject(Router).url).toBe(cropsPath);
    drafts.updatePlantingWindow({ from: '2026-02-30', to: '2026-12-01' });
    await harness.navigateByUrl(path);
    expect(TestBed.inject(Router).url).toBe('/create-plan/planning/planting-window');
    for (const window of [{ from: '1980-12-31', to: '1981-01-02' }, { from: '2026-01-01', to: '2027-01-03' }]) {
      drafts.updatePlantingWindow(window);
      await harness.navigateByUrl(path);
      expect(TestBed.inject(Router).url).toBe('/create-plan/planning/planting-window');
      await harness.navigateByUrl(cropsPath);
      expect(TestBed.inject(Router).url).toBe('/create-plan/planning/planting-window');
    }
  });

  for (const id of COMPARISON_CROPS) {
    it(`shows only the chosen comparison crop ${id} with the API comparison label`, async () => {
      seed([id]);
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(path, RecommendationsComponent);
      const root = harness.routeNativeElement!;
      expect(root.querySelectorAll('.crop-row').length).toBe(1);
      expect(root.querySelector('h3')!.textContent!.toLowerCase()).toBe(id);
      expect(root.textContent).toContain('PRELIMINARY COMPARISON');
      expect(root.textContent).toContain('Historical estimate, not a forecast');
      expect(root.textContent).toContain('Not validated agricultural advice');
      expect(root.querySelector('.choose')!.getAttribute('aria-pressed')).toBe('false');
    });
  }

  it('requires a deliberate choice, replaces the final crop and opens Confirm', async () => {
    const drafts = seed();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(path, RecommendationsComponent);
    const root = harness.routeNativeElement!;
    (root.querySelector('.next') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(root.textContent).toContain('Choose one crop to continue.');
    expect(document.activeElement).toBe(root.querySelector('.choose'));
    expect(drafts.getSelectedCrop()).toBeNull();
    const buttons = root.querySelectorAll<HTMLButtonElement>('.choose');
    buttons[0].click();
    harness.detectChanges();
    expect(drafts.getSelectedCrop()).toBe('potato');
    buttons[1].click();
    harness.detectChanges();
    expect(drafts.getSelectedCrop()).toBe('tomato');
    expect(root.querySelectorAll('.choose[aria-pressed="true"]').length).toBe(1);
    expect(root.querySelector('#selection-error')).toBeNull();
    (root.querySelector('.next') as HTMLButtonElement).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/create-plan/planning/confirm');
    expect(harness.routeNativeElement!.textContent).toContain('Ready to save this plan?');
    expect(drafts.getComparisonCrops()).toEqual(['potato', 'tomato']);
  });

  it('retains one crop through Back/Next and clears it when removed from comparison', async () => {
    const drafts = seed();
    const harness = await RouterTestingHarness.create();
    let component = await harness.navigateByUrl(path, RecommendationsComponent);
    component.select('tomato');
    (harness.routeNativeElement!.querySelector('.footer-content a') as HTMLAnchorElement).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe(cropsPath);
    (harness.routeNativeElement!.querySelector('.primary') as HTMLButtonElement).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe(path);
    expect(harness.routeNativeElement!.querySelectorAll('.choose')[1].getAttribute('aria-pressed')).toBe('true');
    (harness.routeNativeElement!.querySelector('.change-crops') as HTMLAnchorElement).click();
    await harness.fixture.whenStable();
    const crops = harness.routeDebugElement!.componentInstance as ChooseCropsComponent;
    crops.toggle('tomato');
    expect(drafts.getSelectedCrop()).toBeNull();
    crops.submit();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelectorAll('.crop-row').length).toBe(1);
    expect(harness.routeNativeElement!.querySelector('.choose')!.getAttribute('aria-pressed')).toBe('false');
    expect(drafts.get('planning-to-plant').name).toBe('DEMO Field');
    expect(drafts.getPlantingWindow()).toEqual({ from: '2026-12-01', to: '2027-01-15' });
    expect(drafts.get('already-planted')).toEqual({ name: '', location: '' });
    drafts.updateSelectedCrop('tomato');
    expect(drafts.getSelectedCrop()).toBeNull();
  });

  for (const [width, height] of [[1440, 900], [1286, 695], [1024, 768], [390, 844], [1280, 500]]) {
    it(`keeps comparison, disclaimer and actions visible at ${width}x${height}`, async () => {
      seed([...COMPARISON_CROPS]);
      const harness = await RouterTestingHarness.create();
      const component = await harness.navigateByUrl(path, RecommendationsComponent);
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
        await new Promise<void>(resolve => frame.contentWindow!.requestAnimationFrame(() => resolve()));
        expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(width);
        expect(doc.documentElement.scrollHeight).toBeLessThanOrEqual(height);
        expect(doc.querySelectorAll('.crop-row').length).toBe(6);
        for (const img of Array.from(doc.images)) {
          expect(img.naturalWidth).toBeGreaterThan(0);
        }
        const rotate = doc.querySelector<HTMLImageElement>('.change-crops img')!.getBoundingClientRect();
        expect(rotate.width).toBe(19);
        expect(rotate.height).toBe(19);
        const comparison = doc.querySelector('.comparison')!.getBoundingClientRect();
        expect(doc.querySelector('#assessment-notice')!.getBoundingClientRect().bottom).toBeLessThan(comparison.bottom);
        const footer = doc.querySelector('footer')!.getBoundingClientRect();
        const main = doc.querySelector('main')!;
        const steps = doc.querySelector('.step-progress')!.getBoundingClientRect();
        const header = doc.querySelector('header')!.getBoundingClientRect();
        expect(main.getBoundingClientRect().bottom).toBeLessThanOrEqual(footer.top);
        expect(frame.contentWindow!.getComputedStyle(main).overflowY).toBe('auto');
        if (width === 1286) expect(main.scrollHeight).toBeGreaterThan(main.clientHeight);
        if (width === 1440) {
          expect(Math.abs(comparison.top - 338)).toBeLessThan(8);
          expect(comparison.width).toBeGreaterThanOrEqual(1256);
          expect(comparison.width).toBeLessThanOrEqual(1288);
          expect(Math.abs(footer.top - 830)).toBeLessThan(2);
        }
        main.scrollTop = main.scrollHeight;
        expect(doc.querySelector('#selection-error')!.getBoundingClientRect().bottom).toBeLessThanOrEqual(main.getBoundingClientRect().bottom);
        expect(doc.querySelector('header')!.getBoundingClientRect().top).toBe(header.top);
        expect(doc.querySelector('.step-progress')!.getBoundingClientRect().top).toBe(steps.top);
        expect(doc.querySelector('footer')!.getBoundingClientRect().top).toBe(footer.top);
        expect(doc.documentElement.scrollTop).toBe(0);
        (doc.querySelectorAll('.choose')[5] as HTMLButtonElement).focus();
        (doc.querySelectorAll('.choose')[5] as HTMLButtonElement).click();
        harness.detectChanges();
        expect(TestBed.inject(PlanDraftService).getSelectedCrop()).toBe('carrot');
      } finally { frame.remove(); }
    });
  }
});

import { comparisonProvider } from '../../testing/crop-suitability.fixture';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { COMPARISON_CROPS, ComparisonCrop, PlanDraftService } from '../../services/plan-draft.service';
import { ChooseCropsComponent } from './choose-crops.component';
import { PlantingWindowComponent } from '../planting-window/planting-window.component';

describe('Choose Crops', () => {
  const path = '/create-plan/planning/choose-crops';
  const windowPath = '/create-plan/planning/planting-window';

  beforeEach(async () => {
    await TestBed.configureTestingModule({ providers: [provideRouter(routes), comparisonProvider] }).compileComponents();
  });

  function seed(): PlanDraftService {
    const drafts = TestBed.inject(PlanDraftService);
    drafts.update('planning-to-plant', { name: 'DEMO Field', latitude: 31, longitude: 31 });
    drafts.updatePlantingWindow({ from: '2026-12-01', to: '2027-01-15' });
    return drafts;
  }

  it('redirects incomplete direct visits to the required previous step', async () => {
    const harness = await RouterTestingHarness.create(path);
    expect(TestBed.inject(Router).url).toBe('/create-plan/planning/plan-name');
    const drafts = seed();
    drafts.updatePlantingWindow({ from: '', to: '' });
    await harness.navigateByUrl(path);
    expect(TestBed.inject(Router).url).toBe(windowPath);
    drafts.updatePlantingWindow({ from: '2026-02-30', to: '2026-12-01' });
    await harness.navigateByUrl(path);
    expect(TestBed.inject(Router).url).toBe(windowPath);
    drafts.updatePlantingWindow({ from: '2026-12-01', to: '2026-11-01' });
    await harness.navigateByUrl(path);
    expect(TestBed.inject(Router).url).toBe(windowPath);
  });

  it('requires a selection and makes all six crops independently selectable', async () => {
    const drafts = seed();
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl(path, ChooseCropsComponent);
    const root = harness.routeNativeElement!;
    (root.querySelector('.primary') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(root.textContent).toContain('Choose at least one crop to compare.');
    expect(document.activeElement).toBe(root.querySelector('.crop-card'));
    const cards = Array.from(root.querySelectorAll<HTMLButtonElement>('.crop-card'));
    expect(cards.length).toBe(6);
    expect(cards.every(card => !card.disabled)).toBeTrue();
    expect(root.textContent).not.toContain('Coming soon');
    cards[0].click();
    harness.detectChanges();
    expect(cards[0].getAttribute('aria-pressed')).toBe('true');
    expect(root.querySelector('#crop-error')).toBeNull();
    expect(drafts.getComparisonCrops()).toEqual(['potato']);
    cards[1].click();
    harness.detectChanges();
    expect(root.textContent).toContain('2 CROPS SELECTED');
    expect(drafts.getComparisonCrops()).toEqual(['potato', 'tomato']);
    cards[0].click();
    expect(drafts.getComparisonCrops()).toEqual(['tomato']);
    cards[1].click();
    harness.detectChanges();
    expect(root.querySelector('#crop-error')).not.toBeNull();
    expect(component.message).toBe('');
    cards[1].click();
    component.submit();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/create-plan/planning/recommendations');
  });

  it('preserves all six crops through Recommendations Back/Next and filters invalid IDs', async () => {
    const drafts = seed();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(path, ChooseCropsComponent);
    for (const card of Array.from(harness.routeNativeElement!.querySelectorAll<HTMLButtonElement>('.crop-card'))) card.click();
    harness.detectChanges();
    expect(drafts.getComparisonCrops()).toEqual([...COMPARISON_CROPS]);
    expect(harness.routeNativeElement!.textContent).toContain('6 CROPS SELECTED');
    (harness.routeNativeElement!.querySelector('.primary') as HTMLButtonElement).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelectorAll('.crop-row').length).toBe(6);
    expect(harness.routeNativeElement!.textContent).toContain('PRELIMINARY COMPARISON');
    (harness.routeNativeElement!.querySelector('.footer-content a') as HTMLAnchorElement).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(harness.routeNativeElement!.querySelectorAll('.crop-card[aria-pressed="true"]').length).toBe(6);
    drafts.updateComparisonCrops(['onion', 'carrot', 'onion', 'invalid' as ComparisonCrop]);
    expect(drafts.getComparisonCrops()).toEqual(['onion', 'carrot']);
  });

  it('preserves crops, farm and dates through actual Back and Next actions', async () => {
    const drafts = seed();
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(path, ChooseCropsComponent);
    (harness.routeNativeElement!.querySelectorAll('.crop-card')[1] as HTMLButtonElement).click();
    (harness.routeNativeElement!.querySelector('.footer-content a') as HTMLAnchorElement).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe(windowPath);
    const window = harness.routeDebugElement!.componentInstance as PlantingWindowComponent;
    expect(window.form.getRawValue()).toEqual({ from: '2026-12-01', to: '2027-01-15' });
    (harness.routeNativeElement!.querySelector('.primary') as HTMLButtonElement).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe(path);
    expect(harness.routeNativeElement!.querySelectorAll('.crop-card')[1].getAttribute('aria-pressed')).toBe('true');
    expect(drafts.get('planning-to-plant').name).toBe('DEMO Field');
    expect(drafts.get('already-planted')).toEqual({ name: '', location: '' });
    const copy = drafts.getComparisonCrops();
    copy.push('potato');
    expect(drafts.getComparisonCrops()).toEqual(['tomato']);
  });

  for (const [width, height] of [[1440, 900], [1366, 768], [1286, 695], [1024, 768], [390, 844], [1280, 500]]) {
    it(`fits crops, assets and footer at ${width}x${height}`, async () => {
      seed().updateComparisonCrops(['potato', 'tomato']);
      const harness = await RouterTestingHarness.create();
      await harness.navigateByUrl(path, ChooseCropsComponent);
      const component = harness.routeDebugElement!.componentInstance as ChooseCropsComponent;
      for (const crop of COMPARISON_CROPS) {
        if (component.selected.includes(crop)) component.toggle(crop);
      }
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
        doc.querySelector('main')!.scrollTop = 0;
        expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(width);
        if (width >= 1024) expect(doc.documentElement.scrollHeight).toBeLessThanOrEqual(height);
        expect(doc.querySelectorAll('.crop-card').length).toBe(6);
        for (const img of Array.from(doc.querySelectorAll<HTMLImageElement>('.crop-card img'))) {
          expect(img.naturalWidth).toBeGreaterThan(0);
          const bounds = img.getBoundingClientRect();
          expect(bounds.width).toBe(71);
          expect(bounds.height).toBe(71);
          expect(bounds.right).toBeLessThan(img.parentElement!.getBoundingClientRect().right);
        }
        const footer = doc.querySelector('footer')!.getBoundingClientRect();
        const main = doc.querySelector('main')!;
        expect(main.getBoundingClientRect().bottom).toBeLessThanOrEqual(footer.top);
        if (width === 1440) {
          const cards = doc.querySelectorAll('.crop-card');
          expect(cards[0].getBoundingClientRect().top).toBeGreaterThanOrEqual(doc.querySelector('.intro')!.getBoundingClientRect().bottom);
          expect(Math.abs(cards[0].getBoundingClientRect().width - 405)).toBeLessThan(2);
          expect(Math.abs(footer.top - 830)).toBeLessThan(2);
        }
        main.scrollTop = main.scrollHeight;
        expect(doc.querySelector('#crop-error')!.getBoundingClientRect().bottom).toBeLessThanOrEqual(footer.top);
      } finally { frame.remove(); }
    });
  }
});

import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { COMPARISON_CROPS, ComparisonCrop, PlanDraftService } from '../../services/plan-draft.service';
import { PlantingDateComponent } from '../planting-date/planting-date.component';
import { CurrentCropComponent } from './current-crop.component';

describe('Already Planted Current Crop', () => {
  const path = '/create-plan/growing/current-crop';
  const datesPath = '/create-plan/growing/planting-date';

  beforeEach(async () => {
    await TestBed.configureTestingModule({ providers: [provideRouter(routes)] }).compileComponents();
  });

  function seed(): PlanDraftService {
    const drafts = TestBed.inject(PlanDraftService);
    drafts.update('already-planted', { name: 'DEMO Growing Field', location: '31.040000, 31.380000', latitude: 31.04, longitude: 31.38 });
    drafts.updateAlreadyPlantedDates({ plantingDate: '2020-02-29', harvestDate: '2020-06-01' });
    return drafts;
  }

  it('requires the growing farm and valid actual dates before a direct visit', async () => {
    const harness = await RouterTestingHarness.create(path);
    expect(TestBed.inject(Router).url).toBe('/create-plan/growing/plan-name');
    const drafts = seed();
    for (const dates of [
      { plantingDate: '', harvestDate: '' },
      { plantingDate: '2026-02-30', harvestDate: '' },
      { plantingDate: '2999-12-31', harvestDate: '' },
      { plantingDate: '2020-02-29', harvestDate: '2020-02-28' },
    ]) {
      drafts.updateAlreadyPlantedDates(dates);
      await harness.navigateByUrl(path);
      expect(TestBed.inject(Router).url).toBe(datesPath);
    }
  });

  it('requires a choice and allows exactly one of all six crops without saving a plan', async () => {
    const drafts = seed();
    const write = spyOn(Storage.prototype, 'setItem');
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl(path, CurrentCropComponent);
    const root = harness.routeNativeElement!;
    (root.querySelector('.primary') as HTMLButtonElement).click();
    harness.detectChanges();
    expect(root.textContent).toContain('Choose one current crop to continue.');
    expect(document.activeElement).toBe(root.querySelector('.crop-card'));
    const cards = root.querySelectorAll<HTMLButtonElement>('.crop-card');
    expect(cards.length).toBe(6);
    expect(Array.from(cards).every(card => !card.disabled)).toBeTrue();
    for (let index = 0; index < cards.length; index++) {
      cards[index].click();
      harness.detectChanges();
      expect(drafts.getAlreadyPlantedCrop()).toBe(COMPARISON_CROPS[index]);
      expect(root.querySelectorAll('.crop-card[aria-pressed="true"]').length).toBe(1);
      expect(root.textContent).toContain('1 CROP SELECTED');
    }
    cards[5].click();
    expect(drafts.getAlreadyPlantedCrop()).toBe('carrot');
    expect(TestBed.inject(Router).url).toBe(path);
    expect(write).not.toHaveBeenCalled();
    drafts.updateAlreadyPlantedCrop('unknown' as ComparisonCrop);
    expect(drafts.getAlreadyPlantedCrop()).toBeNull();
  });

  it('preserves the growing crop/dates through actual Back/Next while leaving planning untouched', async () => {
    const drafts = seed();
    drafts.update('planning-to-plant', { name: 'DEMO Planning Field', location: 'Egypt', latitude: 30, longitude: 30 });
    drafts.updatePlantingWindow({ from: '2027-01-01', to: '2027-02-01' });
    drafts.updateComparisonCrops(['potato', 'onion']);
    drafts.updateSelectedCrop('onion');
    const before = drafts.getPlanningPlan();
    const harness = await RouterTestingHarness.create(path);
    (harness.routeNativeElement!.querySelectorAll('.crop-card')[1] as HTMLButtonElement).click();
    (harness.routeNativeElement!.querySelector('.footer-content a') as HTMLAnchorElement).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe(datesPath);
    const dates = harness.routeDebugElement!.componentInstance as PlantingDateComponent;
    expect(dates.form.getRawValue()).toEqual({ plantingDate: '2020-02-29', harvestDate: '2020-06-01' });
    dates.form.controls.plantingDate.setValue('2020-02-28');
    (harness.routeNativeElement!.querySelector('.primary') as HTMLButtonElement).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe(path);
    expect(harness.routeNativeElement!.querySelectorAll('.crop-card')[1].getAttribute('aria-pressed')).toBe('true');
    expect(drafts.getAlreadyPlantedDates().plantingDate).toBe('2020-02-28');
    expect(drafts.getAlreadyPlantedCrop()).toBe('tomato');
    expect(drafts.getPlanningPlan()).toEqual(before);
    expect(drafts.getComparisonCrops()).toEqual(['potato', 'onion']);
    expect(drafts.get('already-planted').name).toBe('DEMO Growing Field');
  });

  for (const [width, height] of [[1440, 900], [1286, 695], [1024, 768], [390, 844]]) {
    it(`keeps six cards reachable with fixed chrome at ${width}x${height}`, async () => {
      seed();
      const harness = await RouterTestingHarness.create();
      const component = await harness.navigateByUrl(path, CurrentCropComponent);
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
        expect(doc.querySelector('#current-crop-error')!.getBoundingClientRect().bottom).toBeLessThanOrEqual(main.getBoundingClientRect().bottom);
        expect(doc.querySelector('header')!.getBoundingClientRect().top).toBe(header.top);
        expect(doc.querySelector('.step-progress')!.getBoundingClientRect().top).toBe(progress.top);
        expect(doc.querySelector('footer')!.getBoundingClientRect().top).toBe(footer.top);
        for (const img of Array.from(doc.querySelectorAll<HTMLImageElement>('.crop-card img'))) {
          expect(img.naturalWidth).toBeGreaterThan(0);
          expect(img.getBoundingClientRect().width).toBe(71);
          expect(img.getBoundingClientRect().height).toBe(71);
        }
      } finally { frame.remove(); }
    });
  }
});

import { TestBed } from '@angular/core/testing';
import { FormControl } from '@angular/forms';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { PlanDraftService } from '../../services/plan-draft.service';
import { FarmDetailsComponent } from '../farm-details/farm-details.component';
import { PlantingWindowComponent, validCalendarDate } from './planting-window.component';
import { TileLayer } from 'leaflet';

describe('Planning planting window', () => {
  const path = '/create-plan/planning/planting-window';
  const farmPath = '/create-plan/planning/plan-name';

  beforeEach(async () => {
    spyOn(TileLayer.prototype, 'getTileUrl').and.returnValue('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
    await TestBed.configureTestingModule({ providers: [provideRouter(routes)] }).compileComponents();
  });

  function seedFarm(): void {
    TestBed.inject(PlanDraftService).update('planning-to-plant', { name: 'DEMO North Field', location: '31.040000, 31.380000', latitude: 31.04, longitude: 31.38 });
  }

  it('sends a direct visit without farm details back to Step 1', async () => {
    const harness = await RouterTestingHarness.create(path);
    expect(TestBed.inject(Router).url).toBe(farmPath);
    expect(harness.routeNativeElement!.querySelector('#plan-name')).not.toBeNull();
  });

  it('requires both dates and focuses the first missing field', async () => {
    seedFarm();
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl(path, PlantingWindowComponent);
    component.submit();
    harness.detectChanges();
    expect(component.form.invalid).toBeTrue();
    expect(harness.routeNativeElement!.textContent).toContain('Choose a start date.');
    expect(harness.routeNativeElement!.textContent).toContain('Choose an end date.');
    expect(document.activeElement).toBe(component.fromInput.nativeElement);
    component.form.controls.from.setValue('2026-12-01');
    component.submit();
    expect(document.activeElement).toBe(component.toInput.nativeElement);
    expect(TestBed.inject(Router).url).toBe(path);
  });

  it('rejects equal or reversed dates with the Figma error', async () => {
    seedFarm();
    const harness = await RouterTestingHarness.create();
    const component = await harness.navigateByUrl(path, PlantingWindowComponent);
    for (const to of ['2026-11-01', '2026-12-01']) {
      component.form.setValue({ from: '2026-12-01', to });
      component.submit();
      harness.detectChanges();
      expect(component.form.hasError('order')).toBeTrue();
      expect(harness.routeNativeElement!.textContent).toContain('The end date must be after the start date.');
      expect(component.toInput.nativeElement.getAttribute('aria-invalid')).toBe('true');
      expect(component.message).toBe('');
    }
  });

  it('validates actual calendar dates including leap years', () => {
    for (const value of ['2026-02-29', '2026-02-30', '2026-13-01', '0000-01-01', 'not-a-date']) {
      expect(validCalendarDate(new FormControl(value))).toEqual({ date: true });
    }
    for (const value of ['2028-02-29', '2026-12-01', '0001-01-01']) {
      expect(validCalendarDate(new FormControl(value))).toBeNull();
    }
  });

  it('keeps Farm Details and dates through actual Back and Next actions', async () => {
    seedFarm();
    const harness = await RouterTestingHarness.create();
    let window = await harness.navigateByUrl(path, PlantingWindowComponent);
    window.form.setValue({ from: '2026-12-01', to: '2027-01-15' });
    (harness.routeNativeElement!.querySelector('.footer-content a') as HTMLAnchorElement).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/create-plan/planning/farm-location');
    expect(harness.routeNativeElement!.textContent).toContain('31.040000, 31.380000');
    (harness.routeNativeElement!.querySelector('.footer-content a') as HTMLAnchorElement).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    const name = harness.routeNativeElement!.querySelector('#plan-name') as HTMLInputElement;
    expect(name.value).toBe('DEMO North Field');
    name.value = 'DEMO Updated Farm';
    name.dispatchEvent(new Event('input', { bubbles: true }));
    (harness.routeNativeElement!.querySelector('.footer-content button') as HTMLButtonElement).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe('/create-plan/planning/farm-location');
    (harness.routeNativeElement!.querySelector('.footer-content button') as HTMLButtonElement).click();
    await harness.fixture.whenStable();
    harness.detectChanges();
    expect(TestBed.inject(Router).url).toBe(path);
    window = await harness.navigateByUrl(path, PlantingWindowComponent);
    expect(window.form.getRawValue()).toEqual({ from: '2026-12-01', to: '2027-01-15' });
    expect(TestBed.inject(PlanDraftService).get('planning-to-plant').name).toBe('DEMO Updated Farm');
    window.submit();
    await harness.fixture.whenStable();
    expect(TestBed.inject(Router).url).toBe('/create-plan/planning/choose-crops');
    expect(TestBed.inject(PlanDraftService).get('already-planted')).toEqual({ name: '', location: '' });
  });

  it('preserves a partially entered window when navigating back', async () => {
    seedFarm();
    const harness = await RouterTestingHarness.create();
    let component = await harness.navigateByUrl(path, PlantingWindowComponent);
    component.form.controls.from.setValue('2026-12-01');
    await harness.navigateByUrl(farmPath, FarmDetailsComponent);
    component = await harness.navigateByUrl(path, PlantingWindowComponent);
    expect(component.form.getRawValue()).toEqual({ from: '2026-12-01', to: '' });
  });

  for (const [width, height] of [[1286, 695], [1024, 768], [390, 844], [1280, 500]]) {
    it(`keeps the window and errors accessible at ${width}x${height}`, async () => {
      seedFarm();
      const harness = await RouterTestingHarness.create();
      const component = await harness.navigateByUrl(path, PlantingWindowComponent);
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
            ? new Promise<void>((resolve, reject) => { clone.onload = () => resolve(); clone.onerror = () => reject(new Error('Stylesheet failed to load')); })
            : Promise.resolve();
          doc.head.appendChild(clone);
          return loaded;
        }));
        doc.body.style.margin = '0';
        doc.body.appendChild(harness.routeNativeElement!);
        await doc.fonts.ready;
        await new Promise<void>(resolve => frame.contentWindow!.requestAnimationFrame(() => resolve()));
        expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(width);
        if (width > 760 && height > 600) expect(doc.documentElement.scrollHeight).toBeLessThanOrEqual(height);
        const form = doc.querySelector('form')!.getBoundingClientRect();
        for (const input of Array.from(doc.querySelectorAll('input'))) {
          const bounds = input.getBoundingClientRect();
          expect(bounds.right).toBeLessThanOrEqual(form.right);
          expect(bounds.bottom).toBeLessThanOrEqual(form.bottom);
        }
      } finally { frame.remove(); }
    });
  }
});

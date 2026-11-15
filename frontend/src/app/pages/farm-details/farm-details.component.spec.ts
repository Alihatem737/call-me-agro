import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { PlanDraftService } from '../../services/plan-draft.service';
import { FarmLocationComponent } from '../farm-location/farm-location.component';
import { PlantingWindowComponent } from '../planting-window/planting-window.component';
import { FarmDetailsComponent } from './farm-details.component';
import { TileLayer } from 'leaflet';

describe('Split farm details', () => {
  beforeEach(async () => {
    spyOn(TileLayer.prototype, 'getTileUrl').and.returnValue('data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7');
    await TestBed.configureTestingModule({ providers: [provideRouter(routes)] }).compileComponents();
  });

  for (const branch of ['planning', 'growing']) {
    const namePath = `/create-plan/${branch}/plan-name`;
    const locationPath = `/create-plan/${branch}/farm-location`;
    const journey = branch === 'growing' ? 'already-planted' : 'planning-to-plant';

    it(`opens the ${branch} name page from journey selection`, async () => {
      const harness = await RouterTestingHarness.create('/create-plan');
      const choices = harness.routeNativeElement!.querySelectorAll('.choice');
      (choices[branch === 'growing' ? 1 : 0] as HTMLAnchorElement).click();
      await harness.fixture.whenStable();
      harness.detectChanges();
      expect(TestBed.inject(Router).url).toBe(namePath);
      expect(harness.routeNativeElement!.textContent).toContain('1 OF 2');
      expect(harness.routeNativeElement!.querySelector('#farm-location')).toBeNull();
      expect(harness.routeNativeElement!.textContent).toContain('Next: choose location');
    });

    it(`validates ${branch} name before advancing and location before continuing`, async () => {
      const harness = await RouterTestingHarness.create();
      const name = await harness.navigateByUrl(namePath, FarmDetailsComponent);
      name.form.controls.name.setValue('   ');
      name.submit();
      harness.detectChanges();
      expect(harness.routeNativeElement!.textContent).toContain('Enter a plan name.');
      expect(TestBed.inject(Router).url).toBe(namePath);
      name.form.controls.name.setValue(' DEMO Field ');
      name.submit();
      await harness.fixture.whenStable();
      harness.detectChanges();
      expect(TestBed.inject(Router).url).toBe(locationPath);
      const location = await harness.navigateByUrl(locationPath, FarmLocationComponent);
      location.submit();
      harness.detectChanges();
      expect(harness.routeNativeElement!.textContent).toContain('Choose a location to continue.');
      expect(TestBed.inject(Router).url).toBe(locationPath);
      expect(harness.routeNativeElement!.querySelector('iframe')).toBeNull();
      expect(harness.routeNativeElement!.querySelector('.leaflet-container')).not.toBeNull();
    });

    it(`preserves ${branch} name and location through Back and Next without affecting the other draft`, async () => {
      const harness = await RouterTestingHarness.create();
      let name = await harness.navigateByUrl(namePath, FarmDetailsComponent);
      name.form.controls.name.setValue(' DEMO North Field ');
      name.submit();
      await harness.fixture.whenStable();
      let location = await harness.navigateByUrl(locationPath, FarmLocationComponent);
      location.selectLocation({ latitude: 31.04, longitude: 31.38 });
      const savedLocation = location.selectedLocation;
      (harness.routeNativeElement!.querySelector('.footer-content a') as HTMLAnchorElement).click();
      await harness.fixture.whenStable();
      name = await harness.navigateByUrl(namePath, FarmDetailsComponent);
      expect(name.form.controls.name.value).toBe('DEMO North Field');
      name.form.controls.name.setValue('DEMO Updated Field');
      name.submit();
      await harness.fixture.whenStable();
      location = await harness.navigateByUrl(locationPath, FarmLocationComponent);
      expect(location.selectedLocation).toBe(savedLocation);
      location.submit();
      await harness.fixture.whenStable();
      if (branch === 'planning') {
        expect(TestBed.inject(Router).url).toBe('/create-plan/planning/planting-window');
        const window = await harness.navigateByUrl('/create-plan/planning/planting-window', PlantingWindowComponent);
        window.form.setValue({ from: '2026-12-01', to: '2027-01-15' });
        (harness.routeNativeElement!.querySelector('.footer-content a') as HTMLAnchorElement).click();
        await harness.fixture.whenStable();
        expect(TestBed.inject(Router).url).toBe(locationPath);
        expect(TestBed.inject(PlanDraftService).getPlantingWindow()).toEqual({ from: '2026-12-01', to: '2027-01-15' });
      } else {
          expect(TestBed.inject(Router).url).toBe('/create-plan/growing/planting-date');
      }
      expect(TestBed.inject(PlanDraftService).get(journey)).toEqual({ name: 'DEMO Updated Field', location: savedLocation, latitude: 31.04, longitude: 31.38 });
      expect(TestBed.inject(PlanDraftService).get(branch === 'growing' ? 'planning-to-plant' : 'already-planted')).toEqual({ name: '', location: '' });
    });

    it(`redirects incomplete ${branch} locations and supports the old farm-details URL`, async () => {
      const harness = await RouterTestingHarness.create(locationPath);
      expect(TestBed.inject(Router).url).toBe(namePath);
      await harness.navigateByUrl(`/create-plan/${branch}/farm-details`);
      expect(TestBed.inject(Router).url).toBe(namePath);
    });

    it(`requires real coordinates for ${branch} instead of accepting an old demo label`, async () => {
      TestBed.inject(PlanDraftService).update(journey, { name: 'DEMO Field', location: 'Dakahlia, Egypt · Example' });
      const harness = await RouterTestingHarness.create();
      const location = await harness.navigateByUrl(locationPath, FarmLocationComponent);
      expect(location.form.invalid).toBeTrue();
      location.submit();
      expect(TestBed.inject(Router).url).toBe(locationPath);
      location.selectLocation({ latitude: NaN, longitude: 31 });
      expect(location.form.invalid).toBeTrue();
      location.selectLocation({ latitude: 0, longitude: 0 });
      expect(location.form.valid).toBeTrue();
      expect(TestBed.inject(PlanDraftService).get(journey).latitude).toBe(0);
      expect(TestBed.inject(PlanDraftService).get(journey).longitude).toBe(0);
    });

    for (const path of [namePath, locationPath]) {
      for (const [width, height] of [[1286, 695], [1024, 768], [390, 844]]) {
        it(`keeps ${path} accessible at ${width}x${height}`, async () => {
          TestBed.inject(PlanDraftService).update(journey, { name: 'DEMO Field' });
          const harness = await RouterTestingHarness.create(path);
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
            if (width > 760) expect(doc.documentElement.scrollHeight).toBeLessThanOrEqual(height);
          } finally { frame.remove(); }
        });
      }
    }
  }
});

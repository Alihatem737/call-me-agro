import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { PlanReadResult, PlanStorageService } from '../../services/plan-storage.service';
import { MyPlansComponent } from './my-plans.component';

describe('My Plans', () => {
  const demoPlans = [
    { id: 'demo-north', name: 'DEMO North Field', location: 'Dakahlia, Egypt', journey: 'already-planted' as const },
    { id: 'demo-family', name: 'DEMO Family Farm', location: 'Kafr El-Sheikh, Egypt', journey: 'planning-to-plant' as const },
    { id: 'demo-third', name: 'DEMO Third Field', location: 'Egypt', journey: 'planning-to-plant' as const },
  ];
  let result: PlanReadResult;

  beforeEach(async () => {
    result = { plans: [], error: '' };
    await TestBed.configureTestingModule({
      imports: [MyPlansComponent],
      providers: [provideRouter(routes), { provide: PlanStorageService, useValue: { load: () => result } }],
    }).compileComponents();
  });

  it('shows the empty state and enabled create action', () => {
    const fixture = TestBed.createComponent(MyPlansComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('No plans yet');
    expect(fixture.nativeElement.querySelector('.new-plan button').disabled).toBeFalse();
  });

  it('renders both journeys and makes every saved plan reachable through pagination', () => {
    result.plans = demoPlans;
    const fixture = TestBed.createComponent(MyPlansComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('GROWING');
    expect(fixture.nativeElement.textContent).toContain('PLANNING');
    expect(fixture.nativeElement.querySelectorAll('.plan-card').length).toBe(2);
    fixture.nativeElement.querySelector('.pagination button:last-child').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('DEMO Third Field');
    expect(fixture.nativeElement.textContent).not.toContain('DEMO North Field');
  });

  it('shows a storage error and allows retry without presenting it as an empty account', () => {
    result.error = 'Storage blocked';
    const fixture = TestBed.createComponent(MyPlansComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Plans unavailable');
    result = { plans: [demoPlans[0]], error: '' };
    fixture.nativeElement.querySelector('.storage-error button').click();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('DEMO North Field');
  });

  it('routes each Home action to My Plans and supports direct navigation', async () => {
    const harness = await RouterTestingHarness.create('/');
    for (const selector of ['.start-link', '.plans-link']) {
      await harness.navigateByUrl('/');
      const link = harness.routeNativeElement?.querySelector(selector) as HTMLAnchorElement;
      expect(link.getAttribute('href')).toBe('/my-plans');
      const click = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
      link.dispatchEvent(click);
      expect(click.defaultPrevented).toBeTrue();
      await harness.fixture.whenStable();
      expect(TestBed.inject(Router).url).toBe('/my-plans');
      expect(harness.routeNativeElement?.textContent).toContain('My Plans');
      const homeLink = harness.routeNativeElement?.querySelector('.brand') as HTMLAnchorElement;
      const returnClick = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 });
      homeLink.dispatchEvent(returnClick);
      expect(returnClick.defaultPrevented).toBeTrue();
      await harness.fixture.whenStable();
      expect(TestBed.inject(Router).url).toBe('/');
      expect(harness.routeNativeElement?.querySelector('#home-heading')).not.toBeNull();
    }
    await harness.navigateByUrl('/my-plans', MyPlansComponent);
  });

  for (const [width, height] of [[1286, 695], [1440, 900], [1024, 768], [390, 844], [1280, 500]]) {
    for (const plans of [[], demoPlans]) {
    it(`keeps ${plans.length ? 'saved plans' : 'the empty state'} accessible at ${width}x${height}`, async () => {
      result.plans = plans;
      const fixture = TestBed.createComponent(MyPlansComponent);
      fixture.detectChanges();
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
        doc.body.appendChild(fixture.nativeElement);
        await doc.fonts.ready;
        await Promise.all(Array.from(doc.images).map(image => image.decode()));
        expect(frame.contentWindow!.getComputedStyle(doc.querySelector('.workspace')!).boxSizing).toBe('border-box');
        expect(doc.documentElement.scrollWidth).toBeLessThanOrEqual(width);
        if (width > 900 && height > 600) {
          expect(doc.documentElement.scrollHeight).toBeLessThanOrEqual(height);
        }
        const create = doc.querySelector('.new-plan button')!.getBoundingClientRect();
        const card = doc.querySelector('.new-plan')!.getBoundingClientRect();
        expect(create.bottom).toBeLessThanOrEqual(card.bottom);
        for (const image of Array.from(doc.images)) {
          expect(image.naturalWidth).toBeGreaterThan(0);
          const bounds = image.getBoundingClientRect();
          expect(bounds.width).toBeGreaterThan(0);
          expect(bounds.height).toBeGreaterThan(0);
          expect(bounds.right).toBeLessThanOrEqual(width);
        }
        if (width > 900 && height > 600) expect(create.bottom).toBeLessThanOrEqual(height);
      } finally {
        frame.remove();
        fixture.destroy();
      }
    });
    }
  }
});

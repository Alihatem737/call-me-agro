import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { routes } from '../../app.routes';
import { PLANS_STORAGE_KEY } from '../../services/plan-storage.service';
import { PlannedDashboardComponent } from '../../pages/planned-dashboard/planned-dashboard.component';
import { REPORT_SYMPTOMS } from './report-problem.component';

describe('Report a Problem first modal', () => {
  const base = { name: 'DEMO Field', location: 'Egypt', latitude: 31, longitude: 31 };
  const planned = { ...base, id: 'planned', journey: 'planning-to-plant', status: 'planned', selectedCrop: 'potato', plantingWindow: { from: '2027-01-01', to: '2027-02-01' } } as const;
  const growing = { ...base, id: 'growing', journey: 'already-planted', status: 'growing', selectedCrop: 'tomato', plantingDate: '2020-02-29', harvestDate: '' } as const;
  let raw: string;
  let write: jasmine.Spy;

  beforeEach(async () => {
    raw = JSON.stringify([planned, growing]);
    spyOn(Storage.prototype, 'getItem').and.callFake(key => key === PLANS_STORAGE_KEY ? raw : null);
    write = spyOn(Storage.prototype, 'setItem');
    await TestBed.configureTestingModule({ providers: [provideRouter(routes)] }).compileComponents();
  });

  for (const plan of [planned, growing]) {
    it(`opens from ${plan.journey}, validates one symptom and keeps Next scoped without saving`, async () => {
      const harness = await RouterTestingHarness.create();
      const dashboard = await harness.navigateByUrl(`/plans/${plan.id}/dashboard`, PlannedDashboardComponent);
      (harness.routeNativeElement!.querySelector('.report-problem') as HTMLButtonElement).click();
      harness.detectChanges();
      const root = harness.routeNativeElement!;
      const dialog = root.querySelector('dialog') as HTMLDialogElement;
      expect(dialog.open).toBeTrue();
      expect(dialog.matches(':modal')).toBeTrue();
      expect(dialog.textContent).toContain(plan.selectedCrop === 'potato' ? 'Potato' : 'Tomato');
      expect(dialog.querySelectorAll('input[type="radio"]').length).toBe(6);
      expect(dialog.querySelectorAll('input:checked').length).toBe(0);
      const cards = Array.from(dialog.querySelectorAll<HTMLElement>('.symptom'));
      const neutral = getComputedStyle(cards[0]);
      for (const card of cards) {
        expect(getComputedStyle(card).backgroundColor).toBe(neutral.backgroundColor);
        expect(getComputedStyle(card).borderColor).toBe(neutral.borderColor);
        expect(getComputedStyle(card).borderWidth).toBe(neutral.borderWidth);
        expect(card.querySelector('.mark')!.textContent!.trim()).toBe('');
      }
      expect(dialog.textContent).not.toContain('Guidance coming soon');
      expect(dialog.textContent).not.toContain('Nothing is saved in this step');
      (dialog.querySelector('.next') as HTMLButtonElement).click();
      harness.detectChanges();
      expect(dialog.textContent).toContain('Choose one symptom before continuing.');
      expect(document.activeElement).toBe(dialog.querySelector('input'));
      const inputs = dialog.querySelectorAll<HTMLInputElement>('input');
      for (let index = 0; index < inputs.length; index++) {
        inputs[index].click();
        harness.detectChanges();
        expect(dialog.querySelectorAll('input:checked').length).toBe(1);
        expect(dialog.querySelectorAll('.symptom.selected').length).toBe(1);
        expect(cards[index].querySelector('.mark')!.textContent!.trim()).toBe('✓');
        for (const card of cards.filter((_, position) => position !== index)) {
          expect(card.classList.contains('selected')).toBeFalse();
          expect(card.querySelector('.mark')!.textContent!.trim()).toBe('');
        }
        expect(dashboard.reportDraft).toEqual({ planId: plan.id, crop: plan.selectedCrop, symptom: REPORT_SYMPTOMS[index].id });
      }
      expect(dialog.querySelector('#symptom-error')).toBeNull();
      (dialog.querySelector('.next') as HTMLButtonElement).click();
      harness.detectChanges();
      expect(dialog.textContent).toContain('Identify the insect');
      expect(dialog.textContent).toContain('Visible insects');
      expect(dialog.textContent).toContain('Save problem & return');
      expect(TestBed.inject(Router).url).toBe(`/plans/${plan.id}/dashboard`);
      expect(write).not.toHaveBeenCalled();
      expect(raw).toBe(JSON.stringify([planned, growing]));
      dialog.close();
      await new Promise(resolve => setTimeout(resolve, 0));
      harness.detectChanges();
    });
  }

  it('cancels cleanly, restores focus and clears temporary selection on plan changes', async () => {
    const harness = await RouterTestingHarness.create();
    const dashboard = await harness.navigateByUrl('/plans/planned/dashboard', PlannedDashboardComponent);
    const trigger = harness.routeNativeElement!.querySelector('.report-problem') as HTMLButtonElement;
    trigger.focus();
    trigger.click();
    harness.detectChanges();
    let dialog = harness.routeNativeElement!.querySelector('dialog') as HTMLDialogElement;
    (dialog.querySelector('input') as HTMLInputElement).click();
    harness.detectChanges();
    (dialog.querySelector('footer button') as HTMLButtonElement).click();
    await new Promise(resolve => setTimeout(resolve, 0));
    harness.detectChanges();
    expect(dashboard.reportDraft).toBeNull();
    expect(dashboard.reportOpen).toBeFalse();
    expect(document.activeElement).toBe(trigger);
    trigger.click();
    harness.detectChanges();
    dialog = harness.routeNativeElement!.querySelector('dialog') as HTMLDialogElement;
    (dialog.querySelector('input') as HTMLInputElement).click();
    harness.detectChanges();
    await harness.navigateByUrl('/plans/growing/dashboard');
    expect(dashboard.reportOpen).toBeFalse();
    expect(dashboard.reportDraft).toBeNull();
    (harness.routeNativeElement!.querySelector('.report-problem') as HTMLButtonElement).click();
    harness.detectChanges();
    dialog = harness.routeNativeElement!.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.querySelector('#report-context')!.textContent).toContain('Tomato');
    expect(dialog.querySelectorAll('input:checked').length).toBe(0);
    dialog.close();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(write).not.toHaveBeenCalled();
  });

  it('does not expose reporting for an invalid plan', async () => {
    const harness = await RouterTestingHarness.create('/plans/missing/dashboard');
    expect(harness.routeNativeElement!.querySelector('.report-problem')).toBeNull();
    expect(harness.routeNativeElement!.querySelector('dialog')).toBeNull();
  });

  for (const [width, height] of [[1286, 695], [1440, 900], [390, 844]]) {
    it(`keeps modal content and footer reachable at ${width}x${height}`, async () => {
      const harness = await RouterTestingHarness.create();
      const dashboard = await harness.navigateByUrl('/plans/growing/dashboard', PlannedDashboardComponent);
      dashboard.openReport();
      harness.detectChanges();
      const frame = document.createElement('iframe');
      frame.style.cssText = `width:${width}px;height:${height}px;border:0;position:absolute;left:0;top:0`;
      document.body.appendChild(frame);
      const original = harness.routeNativeElement!.querySelector('dialog') as HTMLDialogElement;
      original.close();
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
        const dialog = original.cloneNode(true) as HTMLDialogElement;
        doc.body.appendChild(dialog);
        dialog.showModal();
        await doc.fonts.ready;
        await Promise.all(Array.from(doc.images).map(img => img.decode()));
        const bounds = dialog.getBoundingClientRect();
        expect(bounds.left).toBeGreaterThanOrEqual(0);
        expect(bounds.right).toBeLessThanOrEqual(width);
        expect(bounds.top).toBeGreaterThanOrEqual(0);
        expect(bounds.bottom).toBeLessThanOrEqual(height);
        const content = dialog.querySelector('.content')!;
        const footer = dialog.querySelector('footer')!.getBoundingClientRect();
        content.scrollTop = content.scrollHeight;
        expect(dialog.querySelector('.symptoms')!.getBoundingClientRect().bottom).toBeLessThanOrEqual(footer.top);
        expect(dialog.querySelector('footer')!.getBoundingClientRect().top).toBe(footer.top);
        expect(dialog.scrollWidth).toBeLessThanOrEqual(dialog.clientWidth);
        dialog.close();
      } finally {
        frame.remove();
        await new Promise(resolve => setTimeout(resolve, 0));
        harness.detectChanges();
      }
    });
  }
});

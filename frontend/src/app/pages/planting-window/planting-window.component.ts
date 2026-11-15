import { Component, ElementRef, ViewChild, inject } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PlanHeaderComponent } from '../../components/plan-header/plan-header.component';
import { PlanDraftService } from '../../services/plan-draft.service';

export function validCalendarDate(control: AbstractControl): ValidationErrors | null {
  const value = control.value;
  if (!value) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || Number(value.slice(0, 4)) === 0) return { date: true };
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value ? { date: true } : null;
}

export function endAfterStart(control: AbstractControl): ValidationErrors | null {
  const from = control.get('from');
  const to = control.get('to');
  if (!from?.value || !to?.value || from.invalid || to.invalid) return null;
  return to.value <= from.value ? { order: true } : null;
}

export function validPlantingWindow(window: { from: string; to: string }): boolean {
  return !!window.from && !!window.to
    && !validCalendarDate({ value: window.from } as AbstractControl)
    && !validCalendarDate({ value: window.to } as AbstractControl)
    && window.from >= '1981-01-01' && window.to > window.from
    && (Date.parse(window.to) - Date.parse(window.from)) / 86400000 < 366;
}

export function plantingWindowLimits(control: AbstractControl): ValidationErrors | null {
  const window = control.value;
  if (!window.from || !window.to || validCalendarDate(control.get('from')!) || validCalendarDate(control.get('to')!)) return null;
  return window.from < '1981-01-01' || (Date.parse(window.to) - Date.parse(window.from)) / 86400000 >= 366
    ? { period: true } : null;
}

@Component({
  selector: 'app-planting-window',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PlanHeaderComponent],
  templateUrl: './planting-window.component.html',
  styleUrls: ['../farm-details/farm-details.component.scss', './planting-window.component.scss'],
})
export class PlantingWindowComponent {
  private readonly drafts = inject(PlanDraftService);
  private readonly router = inject(Router);
  readonly steps = ['Details', 'Planting window', 'Choose crops', 'Recommendations', 'Confirm'];
  readonly form = inject(FormBuilder).nonNullable.group({
    from: ['', [Validators.required, validCalendarDate]],
    to: ['', [Validators.required, validCalendarDate]],
  }, { validators: [endAfterStart, plantingWindowLimits] });
  message = '';
  @ViewChild('fromInput') fromInput!: ElementRef<HTMLInputElement>;
  @ViewChild('toInput') toInput!: ElementRef<HTMLInputElement>;

  constructor() {
    this.form.setValue(this.drafts.getPlantingWindow());
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.drafts.updatePlantingWindow(this.form.getRawValue());
      this.message = '';
    });
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      (this.form.controls.from.invalid ? this.fromInput : this.toInput).nativeElement.focus();
      this.message = '';
      return;
    }
    void this.router.navigateByUrl('/create-plan/planning/choose-crops');
  }
}

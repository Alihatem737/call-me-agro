import { Component, ElementRef, ViewChild, inject } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PlanHeaderComponent } from '../../components/plan-header/plan-header.component';
import { PlanDraftService } from '../../services/plan-draft.service';
import { validCalendarDate } from '../planting-window/planting-window.component';

export function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function notFutureDate(control: AbstractControl): ValidationErrors | null {
  return control.value && !validCalendarDate(control) && control.value > localToday() ? { future: true } : null;
}

export function harvestAfterPlanting(control: AbstractControl): ValidationErrors | null {
  const planting = control.get('plantingDate');
  const harvest = control.get('harvestDate');
  return planting?.value && harvest?.value && planting.valid && harvest.valid && harvest.value < planting.value
    ? { order: true } : null;
}

@Component({
  selector: 'app-planting-date',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PlanHeaderComponent],
  templateUrl: './planting-date.component.html',
  styleUrls: ['../farm-details/farm-details.component.scss', './planting-date.component.scss'],
})
export class PlantingDateComponent {
  private readonly drafts = inject(PlanDraftService);
  private readonly router = inject(Router);
  readonly steps = ['Farm details', 'Planted on', 'Current crop'];
  readonly form = inject(FormBuilder).nonNullable.group({
    plantingDate: ['', [Validators.required, validCalendarDate, notFutureDate]],
    harvestDate: ['', [validCalendarDate]],
  }, { validators: harvestAfterPlanting });
  message = '';
  @ViewChild('plantingInput') plantingInput!: ElementRef<HTMLInputElement>;
  @ViewChild('harvestInput') harvestInput!: ElementRef<HTMLInputElement>;

  get today(): string {
    return localToday();
  }

  constructor() {
    this.form.setValue(this.drafts.getAlreadyPlantedDates());
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.drafts.updateAlreadyPlantedDates(this.form.getRawValue());
      this.message = '';
    });
  }

  submit(): void {
    this.form.controls.plantingDate.updateValueAndValidity({ emitEvent: false });
    this.form.markAllAsTouched();
    this.message = '';
    if (this.form.invalid) {
      (this.form.controls.plantingDate.invalid ? this.plantingInput : this.harvestInput).nativeElement.focus();
      return;
    }
    this.drafts.updateAlreadyPlantedDates(this.form.getRawValue());
    void this.router.navigateByUrl('/create-plan/growing/current-crop');
  }
}

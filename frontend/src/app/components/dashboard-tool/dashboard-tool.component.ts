import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild, inject } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { TitleCasePipe } from '@angular/common';
import { PlannedPlan } from '../../models/planned-plan';
import { GrowingPlan } from '../../models/growing-plan';
import { CareEntry, calendarDate, localToday, recordedAmount } from '../../models/care-entry';
import { CareLogService } from '../../services/care-log.service';
import { PlanStorageService } from '../../services/plan-storage.service';

export type DashboardTool = 'calculator' | 'log' | 'dates' | 'start';
const requiredText = (control: AbstractControl) => control.value?.trim() ? null : { required: true };
const dateValidator = (control: AbstractControl) => !control.value || calendarDate(control.value) ? null : { date: true };

@Component({
  selector: 'app-dashboard-tool',
  standalone: true,
  imports: [ReactiveFormsModule, TitleCasePipe],
  templateUrl: './dashboard-tool.component.html',
  styleUrl: './dashboard-tool.component.scss',
})
export class DashboardToolComponent implements OnInit, AfterViewInit {
  private readonly logs = inject(CareLogService);
  private readonly plans = inject(PlanStorageService);
  private readonly builder = inject(FormBuilder).nonNullable;
  private readonly entryId = crypto.randomUUID();
  private readonly createdAt = new Date().toISOString();
  private closing = false;
  @Input({ required: true }) plan!: PlannedPlan | GrowingPlan;
  @Input({ required: true }) tool!: DashboardTool;
  @Input() entry: CareEntry | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() changed = new EventEmitter<void>();
  @ViewChild('dialog') dialog!: ElementRef<HTMLDialogElement>;
  readonly today = localToday();
  readonly calculator = this.builder.group({ area: [null as number | null, [Validators.required, Validators.min(0.000001)]], rate: ['', [requiredText, Validators.maxLength(160)]] });
  readonly log = this.builder.group({
    type: ['', [Validators.required, Validators.pattern(/^(spray|fertilizer)$/)]],
    date: ['', [Validators.required, dateValidator, (control: AbstractControl) => control.value > localToday() ? { future: true } : null]],
    product: ['', [requiredText, Validators.maxLength(160)]],
    amount: ['', [(control: AbstractControl) => typeof control.value === 'string' && recordedAmount(control.value) ? null : { amount: true }, Validators.maxLength(100)]],
  });
  readonly dates = this.builder.group({ plantingDate: ['', dateValidator], harvestDate: ['', dateValidator] });
  error = '';
  attempted = false;
  result = false;
  success = false;
  viewing = false;

  get title(): string {
    if (this.success) return this.tool === 'log' ? 'Care entry saved' : 'Plan updated';
    if (this.tool === 'calculator') return this.result ? 'Label information required' : 'Pesticide amount calculator';
    if (this.tool === 'log') return this.viewing ? 'Care log entry' : this.entry ? 'Update care log entry' : 'Add a care log entry';
    if (this.tool === 'start') return 'Have you started planting?';
    return this.plan.status === 'growing' ? 'Edit your crop dates' : 'Edit your planned dates';
  }

  ngOnInit(): void {
    this.dates.setValue({ plantingDate: this.plan.plantingDate ?? '', harvestDate: this.plan.harvestDate ?? '' });
    if (this.entry) {
      this.log.setValue({ type: this.entry.type, date: this.entry.date, product: this.entry.product, amount: this.entry.amount });
      this.viewing = true;
      this.log.disable();
    }
  }

  ngAfterViewInit(): void {
    this.dialog.nativeElement.showModal();
    this.dialog.nativeElement.querySelector<HTMLElement>('input:not(:disabled), button')?.focus();
  }

  edit(): void { this.viewing = false; this.log.enable(); }

  submit(): void {
    if (this.success || this.viewing) return;
    this.attempted = true;
    this.error = '';
    if (this.tool === 'calculator') {
      this.calculator.markAllAsTouched();
      if (this.calculator.invalid || !Number.isFinite(this.calculator.controls.area.value)) {
        this.error = 'Enter a positive field area and the label rate with units. Do not guess a dosage.';
        this.focusInvalid();
        return;
      }
      const current = this.plans.loadDashboardPlan(this.plan.id);
      if (!current.plan || current.error || current.plan.selectedCrop !== this.plan.selectedCrop) {
        this.error = 'This plan or crop is no longer available.';
        return;
      }
      this.result = true;
      return;
    }
    if (this.tool === 'log') {
      this.log.markAllAsTouched();
      if (this.log.invalid) {
        this.error = 'Complete the entry type, valid applied date, product, and positive amount with units.';
        this.focusInvalid();
        return;
      }
      const value = this.log.getRawValue();
      this.error = this.logs.save({
        ...value, type: value.type as CareEntry['type'], product: value.product.trim(), amount: value.amount.trim(),
        id: this.entry?.id ?? this.entryId, createdAt: this.entry?.createdAt ?? this.createdAt,
        planId: this.plan.id, crop: this.plan.selectedCrop!,
      }, !!this.entry);
    } else {
      const value = this.dates.getRawValue();
      this.error = this.plans.updateDates(this.plan.id, this.plan.selectedCrop!, value.plantingDate, value.harvestDate, this.tool === 'start');
    }
    if (this.error) return;
    this.success = true;
    this.changed.emit();
  }

  private focusInvalid(): void {
    this.dialog.nativeElement.querySelector<HTMLElement>('.ng-invalid:not(form)')?.focus();
  }

  close(): void { this.dialog.nativeElement.close(); this.onClose(); }
  onClose(): void {
    if (this.closing) return;
    this.closing = true;
    this.closed.emit();
  }
}

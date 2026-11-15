import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnInit, Output, ViewChild, inject } from '@angular/core';
import { DatePipe, TitleCasePipe } from '@angular/common';
import { ComparisonCrop } from '../../services/plan-draft.service';
import { CropReport, REPORT_SYMPTOMS, ReportProblemDraft, SymptomId, reportStatusLabel } from '../../models/crop-report';
import { CropReportStorageService } from '../../services/crop-report-storage.service';
export { REPORT_SYMPTOMS, ReportProblemDraft, SymptomId } from '../../models/crop-report';

@Component({
  selector: 'app-report-problem',
  standalone: true,
  imports: [TitleCasePipe, DatePipe],
  templateUrl: './report-problem.component.html',
  styleUrl: './report-problem.component.scss',
})
export class ReportProblemComponent implements AfterViewInit, OnInit {
  private readonly storage = inject(CropReportStorageService);
  private readonly reportId = crypto.randomUUID();
  private closing = false;
  @Input({ required: true }) planId!: string;
  @Input({ required: true }) crop!: ComparisonCrop;
  @Input({ required: true }) planName!: string;
  @Input() savedReport: CropReport | null = null;
  @Output() closed = new EventEmitter<void>();
  @Output() selectionChanged = new EventEmitter<ReportProblemDraft>();
  @Output() nextRequested = new EventEmitter<ReportProblemDraft>();
  @Output() reportSaved = new EventEmitter<CropReport>();
  @ViewChild('dialog') dialog!: ElementRef<HTMLDialogElement>;
  @ViewChild('firstOption') firstOption!: ElementRef<HTMLInputElement>;
  @ViewChild('closeButton') closeButton!: ElementRef<HTMLButtonElement>;
  readonly statusLabel = reportStatusLabel;
  readonly symptoms = REPORT_SYMPTOMS;
  selected: SymptomId | null = null;
  attempted = false;
  message = '';
  step = 1;
  saving = false;
  saved = false;
  error = '';
  private readonly guidanceBySymptom: Record<SymptomId, readonly { title: string; text: string }[]> = {
    'leaf-spots': [
      { title: 'Remove affected leaves', text: 'Carefully remove heavily damaged leaves when dry and dispose of them away from healthy crops.' },
      { title: 'Improve watering and airflow', text: 'Water near the roots instead of wetting leaves. Improve airflow around crowded plants.' },
      { title: 'Monitor the spread', text: 'Check nearby plants regularly. If spots continue spreading, seek a local agricultural diagnosis.' },
    ],
    'yellowing-leaves': [
      { title: 'Check soil moisture', text: 'Inspect the soil near the roots. Adjust watering if the soil is too dry or waterlogged.' },
      { title: 'Check plant nutrition', text: 'Look for patterns of yellowing and consider a soil or leaf nutrient test before adding fertilizer.' },
      { title: 'Inspect for pests', text: 'Examine both sides of leaves for insects or damage. Monitor whether the yellowing spreads.' },
    ],
    wilting: [
      { title: 'Check the roots and soil', text: 'Check whether the soil is dry or excessively wet. Wilting can happen in either condition.' },
      { title: 'Correct irrigation problems', text: 'Water at the base if the soil is dry. If waterlogged, reduce irrigation and improve drainage.' },
      { title: 'Inspect for disease signs', text: 'Check stems and roots for discoloration or rot. Seek expert identification if wilting continues.' },
    ],
    'slow-growth': [
      { title: 'Review growing conditions', text: 'Check temperature, sunlight, soil moisture, and drainage for the selected crop.' },
      { title: 'Check soil fertility', text: 'Test soil nutrients and pH before making fertilizer adjustments.' },
      { title: 'Remove competition', text: 'Control weeds and check for compacted soil or pest damage that may restrict growth.' },
    ],
    'root-fruit-damage': [
      { title: 'Inspect affected areas', text: 'Check roots and fruits for rot, wounds, insects, or unusual discoloration.' },
      { title: 'Improve field conditions', text: 'Correct poor drainage and inconsistent watering. Remove rotting fruit to reduce further disease spread.' },
      { title: 'Prevent further damage', text: 'Keep tools clean, monitor nearby plants, and request a diagnosis if the damage continues.' },
    ],
    'visible-insects': [
      { title: 'Identify the insect', text: 'Inspect leaves and stems, especially leaf undersides. Record what the insects look like and how many are present.' },
      { title: 'Use non-chemical controls first', text: 'For manageable infestations, remove suitable pests by hand where practical, and protect beneficial insects.' },
      { title: 'Monitor and seek appropriate control', text: 'Check whether damage increases. Use crop-specific integrated pest management guidance before considering pesticides.' },
    ],
  };

  get guidance() {
    return this.selected ? this.guidanceBySymptom[this.selected] : [];
  }

  get selectedSymptom() {
    return REPORT_SYMPTOMS.find(symptom => symptom.id === this.selected);
  }

  ngOnInit(): void {
    if (this.savedReport?.planId === this.planId && this.savedReport.crop === this.crop) {
      this.selected = this.savedReport.symptom;
      this.step = 2;
    }
  }

  back(): void {
    if (this.savedReport) { this.close(); return; }
    if (this.saving || this.saved) return;
    this.step = 1;
    this.error = '';
  }

  save(): void {
    if (this.savedReport || this.saving || this.saved || this.step !== 2 || !this.selectedSymptom) return;
    this.saving = true;
    const report: CropReport = { id: this.reportId, planId: this.planId, crop: this.crop, symptom: this.selectedSymptom.id, createdAt: new Date().toISOString(), status: 'open' };
    this.error = this.storage.save(report);
    if (this.error) {
      this.saving = false;
      return;
    }
    this.saved = true;
    this.reportSaved.emit(report);
    this.close();
  }

  ngAfterViewInit(): void {
    this.dialog.nativeElement.showModal();
    (this.firstOption ?? this.closeButton).nativeElement.focus();
  }

  select(symptom: SymptomId): void {
    if (this.savedReport) return;
    this.selected = symptom;
    this.message = '';
    this.error = '';
    this.selectionChanged.emit({ planId: this.planId, crop: this.crop, symptom });
  }

  next(): void {
    if (this.savedReport) return;
    this.attempted = true;
    if (!this.selected) {
      this.firstOption.nativeElement.focus();
      return;
    }
    this.nextRequested.emit({ planId: this.planId, crop: this.crop, symptom: this.selected });
    this.step = 2;
    this.error = '';
  }

  close(): void {
    this.dialog.nativeElement.close();
    this.onClose();
  }

  onClose(): void {
    if (this.closing) return;
    this.closing = true;
    this.closed.emit();
  }
}

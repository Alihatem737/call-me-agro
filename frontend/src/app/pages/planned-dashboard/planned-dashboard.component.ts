import { Component, inject } from '@angular/core';
import { DatePipe, TitleCasePipe } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PlanHeaderComponent } from '../../components/plan-header/plan-header.component';
import { PlanStorageService } from '../../services/plan-storage.service';
import { ReportProblemComponent, ReportProblemDraft } from '../../components/report-problem/report-problem.component';
import { CropReportStorageService } from '../../services/crop-report-storage.service';
import { CropReport, REPORT_SYMPTOMS, ReportStatus, SymptomId, currentReportStatus } from '../../models/crop-report';
import { DashboardTool, DashboardToolComponent } from '../../components/dashboard-tool/dashboard-tool.component';
import { CareLogService } from '../../services/care-log.service';
import { CareEntry } from '../../models/care-entry';

@Component({
  selector: 'app-planned-dashboard',
  standalone: true,
  imports: [RouterLink, DatePipe, TitleCasePipe, PlanHeaderComponent, ReportProblemComponent, DashboardToolComponent],
  templateUrl: './planned-dashboard.component.html',
  styleUrls: ['./planned-dashboard.component.scss', './problem-status.scss'],
})
export class PlannedDashboardComponent {
  private readonly storage = inject(PlanStorageService);
  private readonly reports = inject(CropReportStorageService);
  private readonly route = inject(ActivatedRoute);
  private readonly logs = inject(CareLogService);
  tool: DashboardTool | null = null;
  careEntry: CareEntry | null = null;
  careResult: ReturnType<CareLogService['load']> = { entries: [], error: '' };
  id = '';
  result: ReturnType<PlanStorageService['loadDashboardPlan']> = { plan: null, error: '' };
  reportOpen = false;
  reportDraft: ReportProblemDraft | null = null;
  reportResult: ReturnType<CropReportStorageService['load']> = { reports: [], error: '' };
  viewingReport: CropReport | null = null;
  reportErrors: Record<string, string> = {};
  statusMessage = '';
  readonly currentStatus = currentReportStatus;

  openTool(tool: DashboardTool, entry: CareEntry | null = null): void {
    if (!this.result.plan?.selectedCrop) return;
    this.careEntry = entry;
    this.tool = tool;
  }

  refreshTools(): void {
    this.result = this.storage.loadDashboardPlan(this.id);
    const plan = this.result.plan;
    this.careResult = plan?.selectedCrop ? this.logs.load(plan.id, plan.selectedCrop) : { entries: [], error: '' };
  }

  changeReportStatus(report: CropReport, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const status = select.value as ReportStatus;
    const plan = this.result.plan;
    const error = plan?.selectedCrop && report.planId === plan.id && report.crop === plan.selectedCrop
      ? this.reports.updateStatus(plan.id, plan.selectedCrop, report.id, status)
      : 'This report does not belong to the current plan and crop.';
    this.statusMessage = '';
    if (error) {
      this.reportErrors[report.id] = error;
      select.value = currentReportStatus(report.status);
      return;
    }
    delete this.reportErrors[report.id];
    this.reloadReports();
    this.statusMessage = 'Problem status updated.';
  }

  viewReport(report: CropReport): void {
    const plan = this.result.plan;
    if (!plan?.selectedCrop || report.planId !== plan.id || report.crop !== plan.selectedCrop) return;
    const result = this.reports.load(plan.id, plan.selectedCrop);
    const fresh = result.reports.find(value => value.id === report.id);
    if (result.error || !fresh) {
      this.reportErrors[report.id] = result.error || 'This report is no longer available.';
      return;
    }
    this.viewingReport = fresh;
    this.reportOpen = true;
  }

  reloadReports(): void {
    const plan = this.result.plan;
    this.reportResult = plan?.selectedCrop ? this.reports.load(plan.id, plan.selectedCrop) : { reports: [], error: '' };
  }

  symptomName(id: SymptomId): string {
    return REPORT_SYMPTOMS.find(symptom => symptom.id === id)?.name ?? id;
  }

  openReport(): void {
    const plan = this.result.plan;
    if (!plan?.selectedCrop) return;
    this.viewingReport = null;
    this.reportDraft = { planId: plan.id, crop: plan.selectedCrop, symptom: null };
    this.reportOpen = true;
  }

  closeReport(): void {
    this.reportOpen = false;
    this.reportDraft = null;
    this.viewingReport = null;
  }

  updateReport(draft: ReportProblemDraft): void {
    if (draft.planId === this.result.plan?.id && draft.crop === this.result.plan.selectedCrop) this.reportDraft = draft;
  }

  get growing(): boolean {
    return this.result.plan?.status === 'growing';
  }

  get plantingWindow(): { from: string; to: string } | null {
    const plan = this.result.plan;
    return plan?.journey === 'planning-to-plant' ? plan.plantingWindow : null;
  }

  constructor() {
    this.route.paramMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.id = params.get('id') ?? '';
      this.reload();
    });
  }

  reload(): void {
    this.closeReport();
    this.tool = null;
    this.careEntry = null;
    this.reportErrors = {};
    this.statusMessage = '';
    this.refreshTools();
    this.reloadReports();
  }

  dateValue(value: unknown): string | null {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return null;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value ? `${value}T00:00:00Z` : null;
  }
}

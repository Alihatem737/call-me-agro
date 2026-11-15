import { Injectable, inject } from '@angular/core';
import { CropReport, REPORT_SYMPTOMS, ReportStatus } from '../models/crop-report';
import { COMPARISON_CROPS, ComparisonCrop } from './plan-draft.service';
import { PlanStorageService } from './plan-storage.service';

export const REPORTS_STORAGE_KEY = 'call-me-agro.reports';

@Injectable({ providedIn: 'root' })
export class CropReportStorageService {
  private readonly plans = inject(PlanStorageService);

  load(planId: string, crop: ComparisonCrop): { reports: CropReport[]; error: string } {
    const result = this.read();
    return { ...result, reports: result.reports.filter(report => report.planId === planId && report.crop === crop) };
  }

  save(report: CropReport): string {
    if (!this.valid(report)) return 'Choose a valid symptom before saving this report.';
    const plan = this.plans.loadDashboardPlan(report.planId);
    if (plan.error || !plan.plan || plan.plan.selectedCrop !== report.crop) return 'This plan or crop is no longer available. Your report was not saved.';
    const result = this.read();
    if (result.error) return result.error;
    const existing = result.reports.find(value => value.id === report.id);
    if (existing) return JSON.stringify(existing) === JSON.stringify(report) ? '' : 'A different report already uses this identifier.';
    try {
      localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify([report, ...result.reports]));
      return '';
    } catch {
      return 'Your report could not be saved. Check browser storage and try again.';
    }
  }

  updateStatus(planId: string, crop: ComparisonCrop, reportId: string, status: ReportStatus): string {
    if (!['open', 'in-progress', 'resolved'].includes(status)) return 'Choose a valid problem status.';
    const plan = this.plans.loadDashboardPlan(planId);
    if (plan.error || !plan.plan || plan.plan.selectedCrop !== crop) return 'This plan or crop is no longer available. The status was not changed.';
    const result = this.read();
    if (result.error) return result.error;
    const index = result.reports.findIndex(report => report.id === reportId && report.planId === planId && report.crop === crop);
    if (index < 0) return 'This report could not be found for the current plan and crop.';
    if (result.reports[index].status === status) return '';
    const updated = result.reports.map((report, reportIndex) => reportIndex === index ? { ...report, status } : report);
    try {
      localStorage.setItem(REPORTS_STORAGE_KEY, JSON.stringify(updated));
      return '';
    } catch {
      return 'The problem status could not be saved. The previous status has been kept. Try again.';
    }
  }

  private read(): { reports: CropReport[]; error: string } {
    try {
      const raw = localStorage.getItem(REPORTS_STORAGE_KEY);
      if (raw === null) return { reports: [], error: '' };
      const value: unknown = JSON.parse(raw);
      if (!Array.isArray(value)) throw new Error('Invalid reports');
      const ids = new Set<string>();
      for (const report of value) {
        if (!this.valid(report) || ids.has(report.id)) throw new Error('Invalid reports');
        ids.add(report.id);
      }
      return { reports: value, error: '' };
    } catch {
      return { reports: [], error: 'Saved reports could not be read safely. Your stored data has not been changed.' };
    }
  }

  private valid(value: unknown): value is CropReport {
    if (typeof value !== 'object' || value === null) return false;
    const report = value as CropReport;
    return ['id', 'planId', 'createdAt'].every(key => typeof (value as Record<string, unknown>)[key] === 'string' && !!((value as Record<string, string>)[key]).trim())
      && COMPARISON_CROPS.includes(report.crop) && REPORT_SYMPTOMS.some(symptom => symptom.id === report.symptom)
      && ['not-resolved', 'open', 'in-progress', 'resolved'].includes(report.status) && Number.isFinite(Date.parse(report.createdAt));
  }
}

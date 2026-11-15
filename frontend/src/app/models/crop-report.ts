import type { ComparisonCrop } from '../services/plan-draft.service';

export const REPORT_SYMPTOMS = [
  { id: 'leaf-spots', name: 'Leaf spots / damage', description: 'Brown or dark areas on leaves' },
  { id: 'yellowing-leaves', name: 'Yellowing leaves', description: 'Guidance coming soon' },
  { id: 'wilting', name: 'Wilting', description: 'Guidance coming soon' },
  { id: 'slow-growth', name: 'Slow growth', description: 'Guidance coming soon' },
  { id: 'root-fruit-damage', name: 'Root or fruit damage', description: 'Guidance coming soon' },
  { id: 'visible-insects', name: 'Visible insects', description: 'Guidance coming soon' },
] as const;

export type SymptomId = typeof REPORT_SYMPTOMS[number]['id'];
export type ReportStatus = 'open' | 'in-progress' | 'resolved';
export function currentReportStatus(status: ReportStatus | 'not-resolved'): ReportStatus {
  return status === 'not-resolved' ? 'open' : status;
}

export function reportStatusLabel(status: ReportStatus | 'not-resolved'): string {
  const current = currentReportStatus(status);
  return current === 'in-progress' ? 'In Progress' : current === 'resolved' ? 'Resolved' : 'Open';
}
export interface ReportProblemDraft {
  planId: string;
  crop: ComparisonCrop;
  symptom: SymptomId | null;
}

export interface CropReport extends ReportProblemDraft {
  id: string;
  symptom: SymptomId;
  createdAt: string;
  status: ReportStatus | 'not-resolved';
}

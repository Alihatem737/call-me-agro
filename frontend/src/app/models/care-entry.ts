import { ComparisonCrop } from '../services/plan-draft.service';

export interface CareEntry {
  id: string;
  planId: string;
  crop: ComparisonCrop;
  type: 'spray' | 'fertilizer';
  date: string;
  product: string;
  amount: string;
  createdAt: string;
}

export function calendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function localToday(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

export function recordedAmount(value: string): boolean {
  return /^(?:\d+(?:\.\d+)?|\.\d+)\s+[\p{L}][\p{L}\d\s/%.()-]*$/u.test(value.trim()) && Number.parseFloat(value) > 0 && Number.isFinite(Number.parseFloat(value));
}

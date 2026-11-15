import { Injectable, inject } from '@angular/core';
import { CareEntry, calendarDate, localToday, recordedAmount } from '../models/care-entry';
import { COMPARISON_CROPS, ComparisonCrop } from './plan-draft.service';
import { PlanStorageService } from './plan-storage.service';

export const CARE_LOG_KEY = 'call-me-agro.care-log';

@Injectable({ providedIn: 'root' })
export class CareLogService {
  private readonly plans = inject(PlanStorageService);

  load(planId: string, crop: ComparisonCrop): { entries: CareEntry[]; error: string } {
    const result = this.read();
    return { ...result, entries: result.entries.filter(entry => entry.planId === planId && entry.crop === crop) };
  }

  save(entry: CareEntry, editing = false): string {
    if (!this.valid(entry)) return 'Complete the entry type, valid applied date, product, and positive amount with units.';
    const plan = this.plans.loadDashboardPlan(entry.planId);
    if (!plan.plan || plan.error || plan.plan.selectedCrop !== entry.crop) return 'This plan or crop is no longer available. The entry was not saved.';
    const result = this.read();
    if (result.error) return result.error;
    const previous = result.entries.find(value => value.id === entry.id);
    if (previous && JSON.stringify(previous) === JSON.stringify(entry)) return '';
    if (editing && (!previous || previous.planId !== entry.planId || previous.crop !== entry.crop || previous.createdAt !== entry.createdAt)) return 'The original entry is no longer available for this plan and crop.';
    if (!editing && previous) return 'Another entry already uses this identifier.';
    const entries = editing ? result.entries.map(value => value.id === entry.id ? entry : value) : [entry, ...result.entries];
    try {
      localStorage.setItem(CARE_LOG_KEY, JSON.stringify(entries));
      return '';
    } catch {
      return 'We could not save this entry. Your information is still here. Check browser storage and try again.';
    }
  }

  private read(): { entries: CareEntry[]; error: string } {
    try {
      const raw = localStorage.getItem(CARE_LOG_KEY);
      const entries: unknown = raw === null ? [] : JSON.parse(raw);
      if (!Array.isArray(entries)) throw new Error('Invalid log');
      const ids = new Set<string>();
      for (const entry of entries) {
        if (!this.valid(entry) || ids.has(entry.id)) throw new Error('Invalid log');
        ids.add(entry.id);
      }
      return { entries, error: '' };
    } catch {
      return { entries: [], error: 'Saved care entries could not be read safely. Your stored data has not been changed.' };
    }
  }

  private valid(value: unknown): value is CareEntry {
    if (!value || typeof value !== 'object') return false;
    const entry = value as CareEntry;
    return ['id', 'planId', 'product', 'amount', 'createdAt'].every(key => typeof (value as Record<string, unknown>)[key] === 'string' && !!(value as Record<string, string>)[key].trim())
      && COMPARISON_CROPS.includes(entry.crop) && ['spray', 'fertilizer'].includes(entry.type)
      && calendarDate(entry.date) && entry.date <= localToday() && entry.product.length <= 160 && entry.amount.length <= 100
      && recordedAmount(entry.amount) && Number.isFinite(Date.parse(entry.createdAt));
  }
}

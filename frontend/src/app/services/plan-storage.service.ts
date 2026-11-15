import { Injectable } from '@angular/core';
import { isCompletePlanningPlan, PlannedPlan } from '../models/planned-plan';
import { GrowingPlan, isCompleteGrowingPlan } from '../models/growing-plan';
import { calendarDate, localToday } from '../models/care-entry';

export interface PlanSummary {
  id: string;
  name: string;
  location: string;
  journey: 'planning-to-plant' | 'already-planted';
  status?: 'planned' | 'growing';
}

export interface PlanReadResult {
  plans: PlanSummary[];
  error: string;
}

export const PLANS_STORAGE_KEY = 'call-me-agro.plans';

@Injectable({ providedIn: 'root' })
export class PlanStorageService {
  updateDates(id: string, crop: string, plantingDate: string, harvestDate: string, startGrowing = false): string {
    const result = this.loadDashboardPlan(id);
    const plan = result.plan;
    if (result.error || !plan || plan.selectedCrop !== crop) return 'This plan or crop is no longer available. Your changes were not saved.';
    const growing = startGrowing || plan.status === 'growing';
    if ((plantingDate && !calendarDate(plantingDate)) || (harvestDate && !calendarDate(harvestDate))) return 'Choose valid calendar dates.';
    if (plan.journey === 'already-planted' && !plantingDate) return 'Enter the actual planting date.';
    if (growing && plantingDate > localToday()) return 'The actual planting date cannot be in the future.';
    if (harvestDate && (!plantingDate || harvestDate < plantingDate)) return 'Harvest date must be on or after the planting date.';
    const updated = { ...plan, plantingDate, harvestDate, status: growing ? 'growing' as const : 'planned' as const };
    const all = this.load();
    if (all.error) return all.error;
    try {
      localStorage.setItem(PLANS_STORAGE_KEY, JSON.stringify(all.plans.map(value => value.id === id ? updated : value)));
      return '';
    } catch {
      return 'Your changes could not be saved. The previous plan has been kept. Try again.';
    }
  }

  loadDashboardPlan(id: string): { plan: PlannedPlan | GrowingPlan | null; error: string } {
    const result = this.load();
    if (result.error) return { plan: null, error: result.error };
    const record = result.plans.find(plan => plan.id === id);
    if (!record) return { plan: null, error: '' };
    try {
      const plan = record as PlannedPlan | GrowingPlan;
      const valid = plan.journey === 'already-planted' ? isCompleteGrowingPlan(plan) : isCompletePlanningPlan(plan);
      return valid ? { plan, error: '' } : { plan: null, error: 'This saved plan does not contain complete crop and date details. Your stored data has not been changed.' };
    } catch {
      return { plan: null, error: 'This saved plan could not be read safely. Your stored data has not been changed.' };
    }
  }

  loadPlannedPlan(id: string): { plan: PlannedPlan | null; error: string } {
    const result = this.load();
    if (result.error) return { plan: null, error: result.error };
    const record = result.plans.find(plan => plan.id === id);
    if (!record) return { plan: null, error: '' };
    try {
      const plan = record as PlannedPlan;
      return isCompletePlanningPlan(plan)
        ? { plan, error: '' }
        : { plan: null, error: 'This saved plan does not contain complete planned-crop details. Your stored data has not been changed.' };
    } catch {
      return { plan: null, error: 'This saved plan could not be read safely. Your stored data has not been changed.' };
    }
  }

  save(plan: PlannedPlan | GrowingPlan): string {
    const valid = plan.journey === 'already-planted' ? isCompleteGrowingPlan(plan) : isCompletePlanningPlan(plan);
    if (!valid) return 'Complete all plan details and choose one crop before saving.';
    try {
      const result = this.load();
      if (result.error) return 'Your plan was not saved because existing browser data could not be read safely. Your stored data has not been changed.';
      const existing = result.plans.find(value => value.id === plan.id);
      if (existing) {
        if (JSON.stringify(existing) === JSON.stringify(plan)) return '';
        return 'A different plan already uses this identifier. Your stored data has not been changed.';
      }
      localStorage.setItem(PLANS_STORAGE_KEY, JSON.stringify([plan, ...result.plans]));
      return '';
    } catch {
      return 'Your plan could not be saved. Check browser storage and try again.';
    }
  }

  load(): PlanReadResult {
    try {
      const raw = localStorage.getItem(PLANS_STORAGE_KEY);
      if (raw === null) return { plans: [], error: '' };
      const value: unknown = JSON.parse(raw);
      if (!Array.isArray(value)) throw new Error('Invalid plans');

      const plans: PlanSummary[] = [];
      const ids = new Set<string>();
      for (const entry of value) {
        if (!this.isPlan(entry) || ids.has(entry.id)) continue;
        ids.add(entry.id);
        plans.push(entry);
      }

      return {
        plans,
        error: plans.length === value.length ? '' : 'Some saved plans could not be read. Your stored data has not been changed.',
      };
    } catch {
      return { plans: [], error: 'Saved plans could not be loaded. Please check browser storage and try again. Your stored data has not been changed.' };
    }
  }

  private isPlan(value: unknown): value is PlanSummary {
    if (typeof value !== 'object' || value === null) return false;
    const plan = value as Record<string, unknown>;
    return ['id', 'name', 'location'].every(key => typeof plan[key] === 'string' && (plan[key] as string).trim().length > 0)
      && (plan['journey'] === 'planning-to-plant' || plan['journey'] === 'already-planted');
  }
}

import type { ComparisonCrop } from '../services/plan-draft.service';

export interface PlannedPlan {
  id: string;
  name: string;
  location: string;
  journey: 'planning-to-plant';
  latitude: number;
  longitude: number;
  plantingWindow: { from: string; to: string };
  selectedCrop: ComparisonCrop | null;
  status: 'planned' | 'growing';
  plantingDate?: string;
  harvestDate?: string;
}

export function isCompletePlanningPlan(plan: PlannedPlan): boolean {
  const validDate = (value: string): boolean => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  return !!plan.id?.trim() && !!plan.name?.trim() && !!plan.location?.trim()
    && plan.journey === 'planning-to-plant' && ['planned', 'growing'].includes(plan.status)
    && Number.isFinite(plan.latitude) && Math.abs(plan.latitude) <= 90
    && Number.isFinite(plan.longitude) && Math.abs(plan.longitude) <= 180
    && !!plan.plantingWindow && validDate(plan.plantingWindow.from) && validDate(plan.plantingWindow.to)
    && plan.plantingWindow.to > plan.plantingWindow.from
    && ['potato', 'tomato', 'onion', 'pepper', 'cucumber', 'carrot'].includes(plan.selectedCrop ?? '');
}

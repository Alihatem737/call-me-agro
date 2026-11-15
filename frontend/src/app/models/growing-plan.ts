import type { PlannedPlan } from './planned-plan';

export interface GrowingPlan extends Omit<PlannedPlan, 'journey' | 'status' | 'plantingWindow' | 'plantingDate'> {
  journey: 'already-planted';
  status: 'growing';
  plantingDate: string;
}

export function isCompleteGrowingPlan(plan: GrowingPlan): boolean {
  const validDate = (value: unknown): value is string => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith('0000')) return false;
    const date = new Date(`${value}T00:00:00Z`);
    return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
  };
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  return typeof plan.id === 'string' && !!plan.id.trim() && typeof plan.name === 'string' && !!plan.name.trim()
    && typeof plan.location === 'string' && !!plan.location.trim()
    && plan.journey === 'already-planted' && plan.status === 'growing'
    && Number.isFinite(plan.latitude) && Math.abs(plan.latitude) <= 90
    && Number.isFinite(plan.longitude) && Math.abs(plan.longitude) <= 180
    && validDate(plan.plantingDate) && plan.plantingDate <= today
    && (plan.harvestDate === undefined || plan.harvestDate === '' || (validDate(plan.harvestDate) && plan.harvestDate >= plan.plantingDate))
    && ['potato', 'tomato', 'onion', 'pepper', 'cucumber', 'carrot'].includes(plan.selectedCrop ?? '');
}

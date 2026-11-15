import { Injectable } from '@angular/core';
import { PlanSummary } from './plan-storage.service';
import { PlannedPlan } from '../models/planned-plan';
import { GrowingPlan } from '../models/growing-plan';

export type PlanJourney = PlanSummary['journey'];
export const COMPARISON_CROPS = ['potato', 'tomato', 'onion', 'pepper', 'cucumber', 'carrot'] as const;
export type ComparisonCrop = typeof COMPARISON_CROPS[number];
export const DRAFT_SESSION_KEY = 'call-me-agro.drafts';
export interface FarmCoordinates {
  latitude: number;
  longitude: number;
}

export function hasCoordinates(value: Partial<FarmCoordinates> | null | undefined): value is FarmCoordinates {
  return !!value && typeof value.latitude === 'number' && Number.isFinite(value.latitude) && Math.abs(value.latitude) <= 90
    && typeof value.longitude === 'number' && Number.isFinite(value.longitude) && Math.abs(value.longitude) <= 180;
}

export interface FarmDraft {
  name: string;
  location: string;
  latitude?: number;
  longitude?: number;
}

export interface PlantingWindowDraft {
  from: string;
  to: string;
}

export interface AlreadyPlantedDates {
  plantingDate: string;
  harvestDate: string;
}

@Injectable({ providedIn: 'root' })
export class PlanDraftService {
  constructor() {
    try {
      const raw: unknown = JSON.parse(sessionStorage.getItem(DRAFT_SESSION_KEY) ?? 'null');
      if (!raw || typeof raw !== 'object') return;
      const value = raw as Record<string, any>;
      for (const journey of ['planning-to-plant', 'already-planted'] as const) {
        const farm = value['drafts']?.[journey];
        if (farm && typeof farm.name === 'string' && typeof farm.location === 'string') {
          this.drafts[journey] = { name: farm.name, location: farm.location, ...(hasCoordinates(farm) ? { latitude: farm.latitude, longitude: farm.longitude } : {}) };
        }
      }
      for (const key of ['planningId', 'growingId'] as const) if (typeof value[key] === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(value[key])) this[key] = value[key];
      if (Array.isArray(value['comparisonCrops'])) this.updateComparisonCrops(value['comparisonCrops']);
      if (COMPARISON_CROPS.includes(value['selectedCrop'])) this.updateSelectedCrop(value['selectedCrop']);
      if (COMPARISON_CROPS.includes(value['alreadyPlantedCrop'])) this.updateAlreadyPlantedCrop(value['alreadyPlantedCrop']);
      if (typeof value['plantingWindow']?.from === 'string' && typeof value['plantingWindow']?.to === 'string') this.updatePlantingWindow({ from: value['plantingWindow'].from, to: value['plantingWindow'].to });
      if (typeof value['alreadyPlantedDates']?.plantingDate === 'string' && typeof value['alreadyPlantedDates']?.harvestDate === 'string') this.updateAlreadyPlantedDates({ plantingDate: value['alreadyPlantedDates'].plantingDate, harvestDate: value['alreadyPlantedDates'].harvestDate });
    } catch {}
  }

  persistForRefresh(): void {
    try {
      sessionStorage.setItem(DRAFT_SESSION_KEY, JSON.stringify({
        drafts: this.drafts, planningId: this.planningId, growingId: this.growingId,
        comparisonCrops: this.comparisonCrops, selectedCrop: this.selectedCrop,
        plantingWindow: this.plantingWindow, alreadyPlantedDates: this.alreadyPlantedDates, alreadyPlantedCrop: this.alreadyPlantedCrop,
      }));
    } catch {}
  }

  hasDraft(journey: PlanJourney): boolean {
    const farm = this.get(journey);
    return !!farm.name.trim() || !!farm.location.trim() || hasCoordinates(farm)
      || (journey === 'already-planted' ? !!this.alreadyPlantedCrop || !!this.alreadyPlantedDates.plantingDate : !!this.comparisonCrops.length || !!this.plantingWindow.from);
  }
  private growingId = crypto.randomUUID();
  private alreadyPlantedCrop: ComparisonCrop | null = null;
  private alreadyPlantedDates: AlreadyPlantedDates = { plantingDate: '', harvestDate: '' };
  private planningId = crypto.randomUUID();
  private comparisonCrops: ComparisonCrop[] = [];
  private selectedCrop: ComparisonCrop | null = null;
  private plantingWindow: PlantingWindowDraft = { from: '', to: '' };
  private readonly drafts: Record<PlanJourney, FarmDraft> = {
    'planning-to-plant': { name: '', location: '' },
    'already-planted': { name: '', location: '' },
  };

  get(journey: PlanJourney): FarmDraft {
    return { ...this.drafts[journey] };
  }

  update(journey: PlanJourney, draft: Partial<FarmDraft>): void {
    this.drafts[journey] = { ...this.drafts[journey], ...draft };
  }

  getPlantingWindow(): PlantingWindowDraft {
    return { ...this.plantingWindow };
  }

  getAlreadyPlantedDates(): AlreadyPlantedDates {
    return { ...this.alreadyPlantedDates };
  }

  getAlreadyPlantedCrop(): ComparisonCrop | null {
    return this.alreadyPlantedCrop;
  }

  updateAlreadyPlantedCrop(crop: ComparisonCrop | null): void {
    this.alreadyPlantedCrop = crop !== null && COMPARISON_CROPS.includes(crop) ? crop : null;
  }

  updateAlreadyPlantedDates(dates: AlreadyPlantedDates): void {
    this.alreadyPlantedDates = { ...dates };
  }

  getComparisonCrops(): ComparisonCrop[] {
    return [...this.comparisonCrops];
  }

  updateComparisonCrops(crops: ComparisonCrop[]): void {
    this.comparisonCrops = [...new Set(crops.filter(crop => COMPARISON_CROPS.includes(crop)))];
    if (this.selectedCrop && !this.comparisonCrops.includes(this.selectedCrop)) this.selectedCrop = null;
  }

  getSelectedCrop(): ComparisonCrop | null {
    return this.selectedCrop;
  }

  updateSelectedCrop(crop: ComparisonCrop): void {
    this.selectedCrop = this.comparisonCrops.includes(crop) ? crop : null;
  }

  updatePlantingWindow(window: PlantingWindowDraft): void {
    this.plantingWindow = { ...window };
  }

  getPlanningPlan(): PlannedPlan {
    const farm = this.get('planning-to-plant');
    return {
      id: this.planningId, name: farm.name.trim(), location: farm.location.trim(),
      journey: 'planning-to-plant', latitude: farm.latitude ?? NaN, longitude: farm.longitude ?? NaN,
      plantingWindow: this.getPlantingWindow(), selectedCrop: this.selectedCrop, status: 'planned',
    };
  }

  getGrowingPlan(): GrowingPlan {
    const farm = this.get('already-planted');
    return {
      id: this.growingId, name: farm.name.trim(), location: farm.location.trim(),
      journey: 'already-planted', latitude: farm.latitude ?? NaN, longitude: farm.longitude ?? NaN,
      ...this.getAlreadyPlantedDates(), selectedCrop: this.alreadyPlantedCrop, status: 'growing',
    };
  }

  completeGrowing(): void {
    this.growingId = crypto.randomUUID();
    this.drafts['already-planted'] = { name: '', location: '' };
    this.alreadyPlantedDates = { plantingDate: '', harvestDate: '' };
    this.alreadyPlantedCrop = null;
    this.clearRefreshSnapshot();
  }

  completePlanning(): void {
    this.planningId = crypto.randomUUID();
    this.drafts['planning-to-plant'] = { name: '', location: '' };
    this.plantingWindow = { from: '', to: '' };
    this.comparisonCrops = [];
    this.selectedCrop = null;
    this.clearRefreshSnapshot();
  }

  private clearRefreshSnapshot(): void {
    try { sessionStorage.removeItem(DRAFT_SESSION_KEY); } catch {}
  }
}

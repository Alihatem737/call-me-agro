import { inject } from '@angular/core';
import { CanActivateFn, Router, Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home.component';
import { MyPlansComponent } from './pages/my-plans/my-plans.component';
import { CreatePlanComponent } from './pages/create-plan/create-plan.component';
import { FarmDetailsComponent } from './pages/farm-details/farm-details.component';
import { PlantingWindowComponent } from './pages/planting-window/planting-window.component';
import { hasCoordinates, PlanDraftService } from './services/plan-draft.service';
import { FarmLocationComponent } from './pages/farm-location/farm-location.component';
import { ChooseCropsComponent } from './pages/choose-crops/choose-crops.component';
import { validCalendarDate, validPlantingWindow } from './pages/planting-window/planting-window.component';
import { FormControl } from '@angular/forms';
import { RecommendationsComponent } from './pages/recommendations/recommendations.component';
import { ConfirmPlanComponent } from './pages/confirm-plan/confirm-plan.component';
import { isCompletePlanningPlan } from './models/planned-plan';
import { PlannedDashboardComponent } from './pages/planned-dashboard/planned-dashboard.component';
import { PlantingDateComponent, notFutureDate } from './pages/planting-date/planting-date.component';
import { CurrentCropComponent } from './pages/current-crop/current-crop.component';
import { BiologicComponent } from './pages/biologic/biologic.component';
import { leavePlanGuard } from './services/leave-plan.service';
import { PlanStorageService } from './services/plan-storage.service';
import { isValidFieldBoundary } from './models/field-boundary';

const requirePlanName: CanActivateFn = route => {
  const growing = route.data['journey'] === 'already-planted';
  const draft = inject(PlanDraftService).get(growing ? 'already-planted' : 'planning-to-plant');
  return draft.name.trim() ? true : inject(Router).createUrlTree([`/create-plan/${growing ? 'growing' : 'planning'}/plan-name`]);
};

const requireGrowingPlan: CanActivateFn = route => {
  const id = route.paramMap.get('id')!;
  const { plan } = inject(PlanStorageService).loadDashboardPlan(id);
  return plan?.status === 'growing' || inject(Router).createUrlTree(['/plans', id, 'dashboard']);
};

const requireMonitoringBoundary: CanActivateFn = route => {
  const id = route.paramMap.get('id')!;
  const { plan } = inject(PlanStorageService).loadDashboardPlan(id);
  const router = inject(Router);
  if (plan?.status !== 'growing') return router.createUrlTree(['/plans', id, 'dashboard']);
  return isValidFieldBoundary(plan.fieldBoundary) || router.createUrlTree(['/plans', id, 'satellite', 'boundary']);
};

export const routes: Routes = [
  {
    path: 'plans/:id/satellite',
    title: 'Satellite Field Monitoring | Call me Agro',
    loadComponent: () => import('./pages/satellite-monitoring/satellite-monitoring.component').then(page => page.SatelliteMonitoringComponent),
    canActivate: [requireMonitoringBoundary],
  },
  {
    path: 'plans/:id/satellite/boundary',
    title: 'Draw Field Boundary | Call me Agro',
    loadComponent: () => import('./pages/field-boundary/field-boundary.component').then(page => page.FieldBoundaryComponent),
    canActivate: [requireGrowingPlan],
  },
  { path: 'plans/:id/biologic', component: BiologicComponent, title: 'BioLogic | Call me Agro' },
  {
    path: 'create-plan/growing/current-crop', component: CurrentCropComponent, title: 'Current Crop | Call me Agro',
    canActivate: [() => {
      const drafts = inject(PlanDraftService);
      const farm = drafts.get('already-planted');
      const router = inject(Router);
      if (!farm.name.trim()) return router.createUrlTree(['/create-plan/growing/plan-name']);
      if (!hasCoordinates(farm)) return router.createUrlTree(['/create-plan/growing/farm-location']);
      const dates = drafts.getAlreadyPlantedDates();
      const planting = new FormControl(dates.plantingDate);
      const harvest = new FormControl(dates.harvestDate);
      return dates.plantingDate && !validCalendarDate(planting) && !notFutureDate(planting)
        && !validCalendarDate(harvest) && (!dates.harvestDate || dates.harvestDate >= dates.plantingDate)
        ? true : router.createUrlTree(['/create-plan/growing/planting-date']);
    }],
  },
  {
    path: 'create-plan/growing/planting-date', component: PlantingDateComponent, title: 'Planting Date | Call me Agro',
    canActivate: [() => {
      const farm = inject(PlanDraftService).get('already-planted');
      return farm.name.trim() && hasCoordinates(farm) ? true : inject(Router).createUrlTree([
        farm.name.trim() ? '/create-plan/growing/farm-location' : '/create-plan/growing/plan-name',
      ]);
    }],
  },
  { path: 'plans/:id/dashboard', component: PlannedDashboardComponent, title: 'Plan Dashboard | Call me Agro' },
  {
    path: 'create-plan/planning/confirm', component: ConfirmPlanComponent, title: 'Confirm Plan | Call me Agro',
    canActivate: [() => {
      const drafts = inject(PlanDraftService);
      return isCompletePlanningPlan(drafts.getPlanningPlan()) && drafts.getComparisonCrops().includes(drafts.getSelectedCrop()!)
        ? true : inject(Router).createUrlTree(['/create-plan/planning/recommendations']);
    }],
  },
  { path: '', component: HomeComponent, pathMatch: 'full', title: 'Call me Agro' },
  { path: 'my-plans', component: MyPlansComponent, title: 'My Plans | Call me Agro' },
  { path: 'create-plan', component: CreatePlanComponent, title: 'Create New Plan | Call me Agro' },
  { path: 'create-plan/planning/plan-name', component: FarmDetailsComponent, data: { journey: 'planning-to-plant' }, title: 'Plan Name | Call me Agro' },
  { path: 'create-plan/planning/farm-location', component: FarmLocationComponent, data: { journey: 'planning-to-plant' }, canActivate: [requirePlanName], title: 'Farm Location | Call me Agro' },
  { path: 'create-plan/planning/farm-details', redirectTo: 'create-plan/planning/plan-name', pathMatch: 'full' },
  {
    path: 'create-plan/planning/planting-window',
    component: PlantingWindowComponent,
    title: 'Planting Window | Call me Agro',
    canActivate: [() => {
      const farm = inject(PlanDraftService).get('planning-to-plant');
      return farm.name.trim() && hasCoordinates(farm) ? true : inject(Router).createUrlTree([farm.name.trim() ? '/create-plan/planning/farm-location' : '/create-plan/planning/plan-name']);
    }],
  },
  { path: 'create-plan/growing/plan-name', component: FarmDetailsComponent, data: { journey: 'already-planted' }, title: 'Plan Name | Call me Agro' },
  {
    path: 'create-plan/planning/choose-crops',
    component: ChooseCropsComponent,
    title: 'Choose Crops | Call me Agro',
    canActivate: [() => {
      const drafts = inject(PlanDraftService);
      const farm = drafts.get('planning-to-plant');
      const router = inject(Router);
      if (!farm.name.trim()) return router.createUrlTree(['/create-plan/planning/plan-name']);
      if (!hasCoordinates(farm)) return router.createUrlTree(['/create-plan/planning/farm-location']);
      const window = drafts.getPlantingWindow();
      return validPlantingWindow(window)
        ? true : router.createUrlTree(['/create-plan/planning/planting-window']);
    }],
  },
  { path: 'create-plan/growing/farm-location', component: FarmLocationComponent, data: { journey: 'already-planted' }, canActivate: [requirePlanName], title: 'Farm Location | Call me Agro' },
  {
    path: 'create-plan/planning/recommendations',
    component: RecommendationsComponent,
    title: 'Recommendations | Call me Agro',
    canActivate: [() => {
      const drafts = inject(PlanDraftService);
      const farm = drafts.get('planning-to-plant');
      const router = inject(Router);
      if (!farm.name.trim()) return router.createUrlTree(['/create-plan/planning/plan-name']);
      if (!hasCoordinates(farm)) return router.createUrlTree(['/create-plan/planning/farm-location']);
      const window = drafts.getPlantingWindow();
      if (!validPlantingWindow(window)) {
        return router.createUrlTree(['/create-plan/planning/planting-window']);
      }
      return drafts.getComparisonCrops().length > 0 ? true : router.createUrlTree(['/create-plan/planning/choose-crops']);
    }],
  },
  { path: 'create-plan/growing/farm-details', redirectTo: 'create-plan/growing/plan-name', pathMatch: 'full' },
  { path: '**', redirectTo: 'my-plans' },
];

for (const route of routes) {
  if (route.component && (route.path?.startsWith('create-plan/planning/') || route.path?.startsWith('create-plan/growing/'))) route.canDeactivate = [leavePlanGuard];
}

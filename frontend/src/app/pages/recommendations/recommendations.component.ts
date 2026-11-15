import { Component, DestroyRef, ElementRef, ViewChild, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { TimeoutError } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CropSuitabilityService } from '../../services/crop-suitability.service';
import { CropSuitabilityResponse } from '../../models/crop-suitability';
import { validPlantingWindow } from '../planting-window/planting-window.component';
import { Router, RouterLink } from '@angular/router';
import { PlanHeaderComponent } from '../../components/plan-header/plan-header.component';
import { ComparisonCrop, PlanDraftService } from '../../services/plan-draft.service';
@Component({
  selector: 'app-recommendations',
  standalone: true,
  imports: [RouterLink, PlanHeaderComponent],
  templateUrl: './recommendations.component.html',
  styleUrl: './recommendations.component.scss',
})
export class RecommendationsComponent {
  private readonly drafts = inject(PlanDraftService);
  private readonly router = inject(Router);
  readonly steps = ['Details', 'Planting window', 'Choose crops', 'Recommendations', 'Confirm'];
  private readonly api = inject(CropSuitabilityService);
  private readonly destroyRef = inject(DestroyRef);
  response: CropSuitabilityResponse | null = null;
  loading = false;
  error = '';
  get crops() { return this.response?.crops ?? []; }

  constructor() { this.load(); }

  load(): void {
    if (this.loading) return;
    this.response = null;
    this.error = '';
    const farm = this.drafts.get('planning-to-plant');
    const plantingWindow = this.drafts.getPlantingWindow();
    if (!validPlantingWindow(plantingWindow)) {
      this.error = 'Choose dates from 1981-01-01, with an end after the start and no more than 366 days including both dates.';
      return;
    }
    this.loading = true;
    const comparisonCrops = this.drafts.getComparisonCrops();
    this.api.assess({ latitude: farm.latitude!, longitude: farm.longitude!, plantingWindow, comparisonCrops })
      .pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
        next: response => {
          this.loading = false;
          if (!response?.climate?.summary || !Array.isArray(response.crops)
            || response.crops.length !== comparisonCrops.length
            || comparisonCrops.some(id => response.crops.filter(crop => crop.id === id).length !== 1)) {
            this.error = 'The server returned an incomplete comparison. Please retry.';
            return;
          }
          this.response = response;
        },
        error: (error: HttpErrorResponse | TimeoutError) => {
          this.loading = false;
          if (error instanceof TimeoutError) {
            this.error = 'The climate request timed out. Please retry.';
            return;
          }
          const fallback = error.status === 0 ? 'Cannot reach the climate service. Check your connection and retry.'
            : error.status === 422 ? 'No comparable historical period is available. Try different planting dates.'
            : error.status === 502 || error.status === 504 ? 'NASA climate data is temporarily unavailable. Please retry.'
            : 'The comparison could not be loaded. Check your dates and retry.';
          this.error = typeof error.error?.detail === 'string' ? error.error.detail : fallback;
        },
      });
  }
  selected = this.drafts.getSelectedCrop();
  attempted = false;
  message = '';
  @ViewChild('firstChoice') firstChoice?: ElementRef<HTMLButtonElement>;

  measurement(value: number | null, unit: string): string {
    return value === null || !Number.isFinite(value) ? 'Unavailable' : new Intl.NumberFormat('en', { maximumFractionDigits: 2 }).format(value) + ' ' + unit;
  }

  select(crop: ComparisonCrop): void {
    if (this.loading || !this.crops.some(value => value.id === crop)) return;
    this.drafts.updateSelectedCrop(crop);
    this.selected = this.drafts.getSelectedCrop();
    this.message = '';
  }

  submit(): void {
    if (this.loading || !this.response || this.error) return;
    this.attempted = true;
    if (!this.selected || !this.crops.some(crop => crop.id === this.selected)) {
      this.firstChoice?.nativeElement.focus();
      return;
    }
    this.drafts.updateSelectedCrop(this.selected);
    void this.router.navigateByUrl('/create-plan/planning/confirm');
  }
}

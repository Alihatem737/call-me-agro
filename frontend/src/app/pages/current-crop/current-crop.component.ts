import { Component, ElementRef, ViewChild, inject } from '@angular/core';
import { TitleCasePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { PlanHeaderComponent } from '../../components/plan-header/plan-header.component';
import { COMPARISON_CROPS, ComparisonCrop, PlanDraftService } from '../../services/plan-draft.service';
import { PlanStorageService } from '../../services/plan-storage.service';

@Component({
  selector: 'app-current-crop',
  standalone: true,
  imports: [RouterLink, TitleCasePipe, PlanHeaderComponent],
  templateUrl: './current-crop.component.html',
  styleUrls: ['../choose-crops/choose-crops.component.scss', './current-crop.component.scss'],
})
export class CurrentCropComponent {
  private readonly drafts = inject(PlanDraftService);
  private readonly storage = inject(PlanStorageService);
  private readonly router = inject(Router);
  readonly crops = COMPARISON_CROPS;
  readonly steps = ['Farm details', 'Planted on', 'Current crop'];
  selected = this.drafts.getAlreadyPlantedCrop();
  attempted = false;
  message = '';
  error = '';
  saving = false;
  saved = false;
  @ViewChild('firstCrop') firstCrop!: ElementRef<HTMLButtonElement>;

  select(crop: ComparisonCrop): void {
    if (this.saving || this.saved) return;
    this.drafts.updateAlreadyPlantedCrop(crop);
    this.selected = this.drafts.getAlreadyPlantedCrop();
    this.message = '';
    this.error = '';
  }

  submit(): void {
    if (this.saving || this.saved) return;
    this.attempted = true;
    if (!this.selected) {
      this.message = '';
      this.firstCrop.nativeElement.focus();
      return;
    }
    this.drafts.updateAlreadyPlantedCrop(this.selected);
    this.saving = true;
    const plan = this.drafts.getGrowingPlan();
    this.error = this.storage.save(plan);
    if (this.error) {
      this.saving = false;
      return;
    }
    this.saved = true;
    this.drafts.completeGrowing();
    void this.router.navigate(['/plans', plan.id, 'dashboard']);
  }
}

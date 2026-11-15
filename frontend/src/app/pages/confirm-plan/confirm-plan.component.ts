import { Component, inject } from '@angular/core';
import { DatePipe, TitleCasePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { PlanHeaderComponent } from '../../components/plan-header/plan-header.component';
import { PlanDraftService } from '../../services/plan-draft.service';
import { PlanStorageService } from '../../services/plan-storage.service';

@Component({
  selector: 'app-confirm-plan',
  standalone: true,
  imports: [RouterLink, DatePipe, TitleCasePipe, PlanHeaderComponent],
  templateUrl: './confirm-plan.component.html',
  styleUrls: ['../farm-details/farm-details.component.scss', './confirm-plan.component.scss'],
})
export class ConfirmPlanComponent {
  private readonly drafts = inject(PlanDraftService);
  private readonly storage = inject(PlanStorageService);
  private readonly router = inject(Router);
  readonly steps = ['Details', 'Planting window', 'Choose crops', 'Recommendations', 'Confirm'];
  readonly plan = this.drafts.getPlanningPlan();
  saving = false;
  saved = false;
  error = '';

  confirm(): void {
    if (this.saving || this.saved) return;
    this.saving = true;
    this.error = this.storage.save(this.plan);
    if (this.error) {
      this.saving = false;
      return;
    }
    this.saved = true;
    this.drafts.completePlanning();
    void this.router.navigate(['/plans', this.plan.id, 'dashboard']);
  }
}

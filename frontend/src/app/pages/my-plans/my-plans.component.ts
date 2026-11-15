import { Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PlanStorageService } from '../../services/plan-storage.service';

@Component({
  selector: 'app-my-plans',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './my-plans.component.html',
  styleUrl: './my-plans.component.scss',
})
export class MyPlansComponent {
  private readonly storage = inject(PlanStorageService);
  result = this.storage.load();
  readonly savedId = inject(ActivatedRoute).snapshot.queryParamMap.get('saved');

  get justSaved(): boolean {
    return !!this.savedId && this.result.plans.some(plan => plan.id === this.savedId);
  }
  page = 0;

  get visiblePlans() {
    return this.result.plans.slice(this.page * 2, this.page * 2 + 2);
  }

  get pageCount() {
    return Math.ceil(this.result.plans.length / 2);
  }

  reload(): void {
    this.result = this.storage.load();
    this.page = 0;
  }
}

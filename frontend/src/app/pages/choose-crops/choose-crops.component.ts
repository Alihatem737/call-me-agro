import { Component, ElementRef, ViewChild, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { PlanHeaderComponent } from '../../components/plan-header/plan-header.component';
import { ComparisonCrop, PlanDraftService } from '../../services/plan-draft.service';

@Component({
  selector: 'app-choose-crops',
  standalone: true,
  imports: [RouterLink, PlanHeaderComponent],
  templateUrl: './choose-crops.component.html',
  styleUrl: './choose-crops.component.scss',
})
export class ChooseCropsComponent {
  private readonly drafts = inject(PlanDraftService);
  private readonly router = inject(Router);
  readonly steps = ['Details', 'Planting window', 'Choose crops', 'Recommendations', 'Confirm'];
  readonly availableCrops: { id: ComparisonCrop; name: string }[] = [
    { id: 'potato', name: 'Potato' },
    { id: 'tomato', name: 'Tomato' },
    { id: 'onion', name: 'Onion' },
    { id: 'pepper', name: 'Pepper' },
    { id: 'cucumber', name: 'Cucumber' },
    { id: 'carrot', name: 'Carrot' },
  ];
  selected = this.drafts.getComparisonCrops();
  attempted = false;
  message = '';
  @ViewChild('firstCrop') firstCrop!: ElementRef<HTMLButtonElement>;

  toggle(crop: ComparisonCrop): void {
    this.selected = this.selected.includes(crop)
      ? this.selected.filter(value => value !== crop)
      : [...this.selected, crop];
    this.drafts.updateComparisonCrops(this.selected);
    this.message = '';
  }

  submit(): void {
    this.attempted = true;
    if (!this.selected.length) {
      this.message = '';
      this.firstCrop.nativeElement.focus();
      return;
    }
    this.drafts.updateComparisonCrops(this.selected);
    void this.router.navigateByUrl('/create-plan/planning/recommendations');
  }
}

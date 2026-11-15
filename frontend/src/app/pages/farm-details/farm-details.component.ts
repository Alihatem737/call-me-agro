import { Component, ElementRef, ViewChild, inject } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PlanHeaderComponent } from '../../components/plan-header/plan-header.component';
import { PlanDraftService, PlanJourney } from '../../services/plan-draft.service';

@Component({
  selector: 'app-farm-details',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PlanHeaderComponent],
  templateUrl: './farm-details.component.html',
  styleUrls: ['./farm-details.component.scss', './plan-name.component.scss'],
})
export class FarmDetailsComponent {
  private readonly drafts = inject(PlanDraftService);
  private readonly router = inject(Router);
  readonly journey = inject(ActivatedRoute).snapshot.data['journey'] as PlanJourney;
  readonly growing = this.journey === 'already-planted';
  readonly steps = this.growing ? ['Farm details', 'Planted on', 'Current crop'] : ['Details', 'Planting window', 'Choose crops', 'Recommendations', 'Confirm'];
  readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.required, (control: AbstractControl) => control.value?.trim() ? null : { required: true }]],
  });
  @ViewChild('nameInput') nameInput!: ElementRef<HTMLInputElement>;

  constructor() {
    this.form.controls.name.setValue(this.drafts.get(this.journey).name);
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      this.drafts.update(this.journey, this.form.getRawValue());
    });
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.nameInput.nativeElement.focus();
      return;
    }
    this.form.controls.name.setValue(this.form.controls.name.value.trim());
    void this.router.navigateByUrl(`/create-plan/${this.growing ? 'growing' : 'planning'}/farm-location`);
  }
}

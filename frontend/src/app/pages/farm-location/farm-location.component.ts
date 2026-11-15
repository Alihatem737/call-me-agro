import { Component, ViewChild, inject } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PlanHeaderComponent } from '../../components/plan-header/plan-header.component';
import { FarmCoordinates, hasCoordinates, PlanDraftService, PlanJourney } from '../../services/plan-draft.service';
import { FarmMapComponent } from '../../components/farm-map/farm-map.component';

@Component({
  selector: 'app-farm-location',
  standalone: true,
  imports: [ReactiveFormsModule, RouterLink, PlanHeaderComponent, FarmMapComponent],
  templateUrl: './farm-location.component.html',
  styleUrls: ['../farm-details/farm-details.component.scss', './farm-location.component.scss'],
})
export class FarmLocationComponent {
  private readonly drafts = inject(PlanDraftService);
  private readonly router = inject(Router);
  readonly journey = inject(ActivatedRoute).snapshot.data['journey'] as PlanJourney;
  readonly growing = this.journey === 'already-planted';
  readonly nameRoute = `/create-plan/${this.growing ? 'growing' : 'planning'}/plan-name`;
  readonly steps = this.growing ? ['Farm details', 'Planted on', 'Current crop'] : ['Details', 'Planting window', 'Choose crops', 'Recommendations', 'Confirm'];
  readonly form = inject(FormBuilder).group({
    coordinates: inject(FormBuilder).control<FarmCoordinates | null>(null, [Validators.required, control =>
      control.value === null || hasCoordinates(control.value) ? null : { coordinates: true }]),
  });
  message = '';
  @ViewChild(FarmMapComponent) farmMap!: FarmMapComponent;

  constructor() {
    const draft = this.drafts.get(this.journey);
    if (hasCoordinates(draft)) this.form.controls.coordinates.setValue({ latitude: draft.latitude, longitude: draft.longitude });
    this.form.valueChanges.pipe(takeUntilDestroyed()).subscribe(() => {
      const point = this.form.controls.coordinates.value;
      this.drafts.update(this.journey, {
        latitude: hasCoordinates(point) ? point.latitude : undefined,
        longitude: hasCoordinates(point) ? point.longitude : undefined,
        location: this.selectedLocation,
      });
      this.message = '';
    });
  }

  get selectedLocation(): string {
    const point = this.form.controls.coordinates.value;
    return hasCoordinates(point) ? `${point.latitude.toFixed(6)}, ${point.longitude.toFixed(6)}` : '';
  }

  selectLocation(point: FarmCoordinates): void {
    this.form.controls.coordinates.setValue(point);
  }

  submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.farmMap.focus();
      return;
    }
    if (!this.growing) {
      void this.router.navigateByUrl('/create-plan/planning/planting-window');
      return;
    }
    void this.router.navigateByUrl('/create-plan/growing/planting-date');
  }
}

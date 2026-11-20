import { TitleCasePipe } from '@angular/common';
import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FarmMapComponent } from '../../components/farm-map/farm-map.component';
import { PlanHeaderComponent } from '../../components/plan-header/plan-header.component';
import { FieldBoundary, isValidFieldBoundary } from '../../models/field-boundary';
import { PlanStorageService } from '../../services/plan-storage.service';
import type { FarmCoordinates } from '../../services/plan-draft.service';

@Component({
  standalone: true,
  imports: [FarmMapComponent, PlanHeaderComponent, RouterLink, TitleCasePipe],
  templateUrl: './field-boundary.component.html',
  styleUrl: './field-boundary.component.scss',
})
export class FieldBoundaryComponent {
  private readonly storage = inject(PlanStorageService);
  private readonly router = inject(Router);
  id = '';
  plan: ReturnType<PlanStorageService['loadDashboardPlan']>['plan'] = null;
  coordinates: FarmCoordinates | null = null;
  boundary: FieldBoundary = [];
  closed = false;
  error = '';

  constructor() {
    inject(ActivatedRoute).paramMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.id = params.get('id')!;
      const { plan, error } = this.storage.loadDashboardPlan(this.id);
      this.plan = plan?.status === 'growing' ? plan : null;
      this.coordinates = this.plan;
      const stored = this.plan?.fieldBoundary;
      this.boundary = isValidFieldBoundary(stored) ? stored : [];
      this.closed = this.boundary.length > 0;
      this.error = this.plan ? '' : error || 'This growing plan is no longer available.';
    });
  }

  updateBoundary(boundary: FieldBoundary): void {
    this.boundary = boundary;
    this.error = '';
  }

  closeOutline(): void {
    if (!isValidFieldBoundary(this.boundary)) {
      this.error = 'Draw at least three distinct corners, with no crossing or overlapping edges.';
      return;
    }
    this.closed = true;
    this.error = '';
  }

  undoPoint(): void {
    this.closed = false;
    this.updateBoundary(this.boundary.slice(0, -1));
  }

  clearOutline(): void {
    this.closed = false;
    this.updateBoundary([]);
  }

  save(): void {
    if (!this.closed) this.closeOutline();
    if (!this.closed) return;
    this.error = this.storage.updateFieldBoundary(this.id, this.boundary);
    if (!this.error) void this.router.navigate(['/plans', this.id, 'satellite']);
  }
}

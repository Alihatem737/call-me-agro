import { Component, ElementRef, ViewChild, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { PlanStorageService } from '../../services/plan-storage.service';
import { BIOLOGIC_SECTIONS } from './biologic-content';

@Component({
  selector: 'app-biologic',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './biologic.component.html',
  styleUrl: './biologic.component.scss',
})
export class BiologicComponent {
  private readonly storage = inject(PlanStorageService);
  id = '';
  result: ReturnType<PlanStorageService['loadDashboardPlan']> = { plan: null, error: '' };
  readonly sections = BIOLOGIC_SECTIONS;
  @ViewChild('articleMain') main!: ElementRef<HTMLElement>;
  constructor() {
    inject(ActivatedRoute).paramMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.id = params.get('id') ?? '';
      this.reload();
    });
  }
  reload(): void { this.result = this.storage.loadDashboardPlan(this.id); }
  jump(id: string): void {
    const section = this.main.nativeElement.querySelector<HTMLElement>(`#${id}`);
    if (section) { section.scrollIntoView({ block: 'start' }); section.focus({ preventScroll: true }); }
  }
}

import { Component, HostListener, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { PlanDraftService } from './services/plan-draft.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent {
  private readonly drafts = inject(PlanDraftService);
  @HostListener('window:beforeunload') persistDraft(): void { this.drafts.persistForRefresh(); }
  title = 'frontend';
}

import { Component, Input } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-plan-header',
  standalone: true,
  imports: [RouterLink],
  template: `<header>
    <a class="brand" routerLink="/" aria-label="Call me Agro home">
      <img src="assets/create-plan/logo.png" width="49" height="49" alt="" />
      <span>call me agro</span>
    </a>
    <nav aria-label="Plan navigation">
      <a routerLink="/my-plans">{{ plansLabel }}</a>
      <span class="mode" [class.growing]="mode === 'GROWING MODE' || mode === 'GROWING'" [class.satellite]="mode === 'NASA HLS'">{{ mode }}</span>
    </nav>
  </header>`,
  styleUrl: './plan-header.component.scss',
})
export class PlanHeaderComponent {
  @Input() mode = 'NEW PLAN';
  @Input() plansLabel = 'Your plans';
}

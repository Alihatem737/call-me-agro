import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PlanHeaderComponent } from '../../components/plan-header/plan-header.component';

@Component({
  selector: 'app-create-plan',
  standalone: true,
  imports: [RouterLink, PlanHeaderComponent],
  templateUrl: './create-plan.component.html',
  styleUrl: './create-plan.component.scss',
})
export class CreatePlanComponent {}

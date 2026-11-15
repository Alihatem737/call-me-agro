import { Injectable, inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { PlanDraftService, PlanJourney } from './plan-draft.service';

@Injectable({ providedIn: 'root' })
export class LeavePlanService {
  private readonly drafts = inject(PlanDraftService);
  private pending: Promise<boolean> | null = null;

  confirm(journey: PlanJourney): Promise<boolean> {
    if (this.pending) return this.pending;
    this.pending = new Promise(resolve => {
      const dialog = document.createElement('dialog');
      dialog.className = 'leave-plan-dialog';
      dialog.setAttribute('aria-labelledby', 'leave-plan-heading');
      dialog.innerHTML = '<h2 id="leave-plan-heading">Leave without finishing?</h2><p>Your unsaved plan choices will be lost if you leave this form.</p><p>You can continue editing, or discard this draft and return to the path selection.</p><footer><button class="keep" type="button">Keep editing</button><button class="discard" type="button">Discard draft</button></footer>';
      let done = false;
      const finish = (discard: boolean) => {
        if (done) return;
        done = true;
        if (discard) journey === 'already-planted' ? this.drafts.completeGrowing() : this.drafts.completePlanning();
        dialog.close();
        dialog.remove();
        this.pending = null;
        resolve(discard);
      };
      dialog.querySelector('.keep')!.addEventListener('click', () => finish(false));
      dialog.querySelector('.discard')!.addEventListener('click', () => finish(true));
      dialog.addEventListener('cancel', event => { event.preventDefault(); finish(false); });
      document.body.appendChild(dialog);
      dialog.showModal();
      (dialog.querySelector('.keep') as HTMLButtonElement).focus();
    });
    return this.pending;
  }
}

export const leavePlanGuard: CanDeactivateFn<unknown> = (_component, _route, current, next) => {
  const branch = current.url.startsWith('/create-plan/growing/') ? 'growing' : 'planning';
  const journey = branch === 'growing' ? 'already-planted' : 'planning-to-plant';
  if (next.url.startsWith(`/create-plan/${branch}/`) || !inject(PlanDraftService).hasDraft(journey)) return true;
  return inject(LeavePlanService).confirm(journey);
};

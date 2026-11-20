import { DatePipe, DecimalPipe } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { Component, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { EMPTY, Subject, catchError, switchMap, tap } from 'rxjs';
import { FarmMapComponent } from '../../components/farm-map/farm-map.component';
import { PlanHeaderComponent } from '../../components/plan-header/plan-header.component';
import { isValidFieldBoundary } from '../../models/field-boundary';
import { ObservationRange, SatelliteObservation, SatelliteResponse, VegetationIndicator, toBoundaryGeometry, vegetationLegend } from '../../models/satellite-monitoring';
import { PlanStorageService } from '../../services/plan-storage.service';
import { SatelliteMonitoringService } from '../../services/satellite-monitoring.service';

const DAY = 86400000;
type RequestStep = 'dates' | 'analysis' | 'history';

const problems: Record<string, string> = {
  INVALID_REQUEST: 'The satellite service could not use this date range or indicator. Check your selection.',
  INVALID_BOUNDARY: 'The saved boundary is outside the supported geometry limits. Edit the field boundary and try again.',
  FIELD_TOO_LARGE: 'The field exceeds the supported area of 100 hectares. Edit the field boundary to monitor a smaller area.',
  FIELD_TOO_SMALL: 'The field is smaller than 8,100 m². NASA HLS may have too few whole 30 m pixels for this plot.',
  TOO_MANY_OBSERVATIONS: 'This search returned too many observations. Choose a shorter date range.',
  EARTHDATA_NOT_CONFIGURED: 'Catalog dates can be shown. The server needs Earthdata access before it can read protected NASA imagery.',
  EARTHDATA_AUTHENTICATION_FAILED: 'The satellite service could not authenticate with NASA Earthdata. Server access needs to be restored.',
  PROVIDER_ERROR: 'NASA imagery could not be retrieved or processed. Try again later.',
  PROVIDER_RATE_LIMITED: 'NASA is limiting requests right now. Try again later.',
  PROVIDER_TIMEOUT: 'The NASA provider took too long to respond. Try again later.',
  PROCESSING_TIMEOUT: 'Satellite processing took too long. Try a shorter date range.',
  SATELLITE_BUSY: 'The satellite service is processing another request. Wait a moment and retry.',
};

const qualityMessages: Record<SatelliteObservation['status'], string> = {
  QUALITY_NOT_EVALUATED: 'Field pixel quality has not been evaluated for this catalog result.',
  COMPLETE: '',
  CLOUD_OBSCURED: 'Clouds or cloud shadows contributed to insufficient usable field pixels.',
  INSUFFICIENT_PIXELS: 'This observation has fewer than nine whole 30 m pixels inside the field.',
  INSUFFICIENT_VALID_PIXELS: 'Too few pixels passed quality checks or covered enough of the field.',
  NO_VALID_DATA: 'This observation contains no usable vegetation pixels inside the field.',
};

@Component({
  standalone: true,
  imports: [DatePipe, DecimalPipe, RouterLink, FarmMapComponent, PlanHeaderComponent],
  templateUrl: './satellite-monitoring.component.html',
  styleUrl: './satellite-monitoring.component.scss',
})
export class SatelliteMonitoringComponent {
  private readonly api = inject(SatelliteMonitoringService);
  private readonly storage = inject(PlanStorageService);
  private readonly requests = new Subject<RequestStep>();
  private activeRange: ObservationRange | null = null;
  private geometry: ReturnType<typeof toBoundaryGeometry> | null = null;
  readonly legend = vegetationLegend;
  readonly indicators: VegetationIndicator[] = ['NDVI', 'NDMI'];
  readonly today = new Date().toISOString().slice(0, 10);
  startDate = new Date(Date.now() - 9 * DAY).toISOString().slice(0, 10);
  endDate = this.today;
  indicator: VegetationIndicator = 'NDVI';
  id = '';
  plan: ReturnType<PlanStorageService['loadDashboardPlan']>['plan'] = null;
  selectedDate = '';
  selectedObservation: SatelliteObservation | null = null;
  dates: string[] = [];
  catalog: SatelliteResponse | null = null;
  analysis: SatelliteResponse | null = null;
  history: SatelliteResponse | null = null;
  historyPoints: { observation: SatelliteObservation; x: number; y: number }[] = [];
  chartLine = '';
  loading: RequestStep | null = null;
  failure: { code: string; message: string; step: RequestStep } | null = null;
  rangeError = '';

  constructor() {
    this.requests.pipe(switchMap(step => this.request(step)), takeUntilDestroyed()).subscribe();
    inject(ActivatedRoute).paramMap.pipe(takeUntilDestroyed()).subscribe(params => {
      this.id = params.get('id')!;
      const { plan } = this.storage.loadDashboardPlan(this.id);
      this.plan = plan?.status === 'growing' && isValidFieldBoundary(plan.fieldBoundary) ? plan : null;
      this.geometry = this.plan?.fieldBoundary ? toBoundaryGeometry(this.plan.fieldBoundary) : null;
      this.loadRange();
    });
  }

  get unavailable(): string {
    if (this.failure && this.failure.step !== 'history') return this.failure.message;
    if (this.selectedObservation) return qualityMessages[this.selectedObservation.status];
    if (this.catalog?.status === 'NO_OBSERVATIONS') return 'No satellite observations were found in the selected date range.';
    if (this.analysis && !this.analysis.observations.length) return 'No satellite observations were found on the selected date.';
    return '';
  }

  get resolution(): number | null {
    return (this.analysis ?? this.catalog)?.resolutionMeters ?? null;
  }

  get limitations(): string {
    return (this.analysis ?? this.catalog)?.limitations ?? '';
  }

  get indicatorDescription(): string {
    return this.indicator === 'NDVI' ? 'Vegetation greenness' : 'Vegetation moisture response';
  }

  loadRange(): void {
    const start = Date.parse(this.startDate);
    const end = Date.parse(this.endDate);
    if (!this.calendarDate(this.startDate) || !this.calendarDate(this.endDate)
      || this.startDate < '2013-01-01' || this.endDate > this.today || end < start || end - start >= 366 * DAY) {
      this.rangeError = 'Choose up to 366 days between January 1, 2013 and today.';
      return;
    }
    this.rangeError = '';
    this.activeRange = { startDate: this.startDate, endDate: this.endDate };
    this.requests.next('dates');
  }

  selectIndicator(indicator: VegetationIndicator): void {
    if (this.indicator === indicator || !this.activeRange) return;
    this.indicator = indicator;
    this.requests.next('dates');
  }

  selectDate(date: string): void {
    if (date === this.selectedDate || !this.dates.includes(date)) return;
    this.selectedDate = date;
    this.requests.next('analysis');
  }

  selectObservation(id: string): void {
    const observation = this.analysis?.observations.find(item => item.id === id);
    if (observation) this.selectedObservation = observation;
  }

  retry(): void {
    if (this.failure) this.requests.next(this.failure.step);
  }

  private request(step: RequestStep) {
    if (!this.geometry || !this.activeRange) return EMPTY;
    this.failure = null;
    this.loading = step;
    if (step === 'history') return this.loadHistory();
    this.analysis = null;
    this.selectedObservation = null;
    if (step === 'analysis') return this.loadAnalysis();

    this.catalog = null;
    this.dates = [];
    this.selectedDate = '';
    this.history = null;
    this.historyPoints = [];
    this.chartLine = '';
    return this.api.availableDates(this.geometry, this.indicator, this.activeRange).pipe(
      catchError(error => this.fail('dates', error)),
      switchMap(response => {
        this.catalog = response;
        this.dates = [...new Set(response.observations.map(item => item.date))].sort().reverse();
        this.selectedDate = this.dates[0] ?? '';
        if (this.selectedDate) return this.loadAnalysis();
        this.loading = null;
        return EMPTY;
      }),
    );
  }

  private loadAnalysis() {
    this.loading = 'analysis';
    return this.api.fieldAnalysis(this.geometry!, this.indicator, this.selectedDate).pipe(
      catchError(error => this.fail('analysis', error)),
      switchMap(response => {
        this.analysis = response;
        this.selectedObservation = response.observations.find(item => item.status === 'COMPLETE')
          ?? response.observations[0] ?? null;
        if (!this.history) return this.loadHistory();
        this.loading = null;
        return EMPTY;
      }),
    );
  }

  private loadHistory() {
    this.loading = 'history';
    return this.api.vegetationHistory(this.geometry!, this.indicator, this.activeRange!).pipe(
      catchError(error => this.fail('history', error)),
      tap(response => {
        this.history = response;
        this.setChart(response.observations);
        this.loading = null;
      }),
    );
  }

  private fail(step: RequestStep, error: unknown) {
    const code = error instanceof HttpErrorResponse ? error.error?.code ?? (error.status === 0 ? 'NETWORK' : 'UNKNOWN') : 'TIMEOUT';
    const detail = error instanceof HttpErrorResponse && typeof error.error?.detail === 'string'
      && ['INVALID_BOUNDARY', 'FIELD_TOO_SMALL', 'FIELD_TOO_LARGE'].includes(code) ? error.error.detail : '';
    const message = detail || (typeof code === 'string' && Object.prototype.hasOwnProperty.call(problems, code) ? problems[code] : '') ||
      (code === 'NETWORK' ? 'Could not connect to the satellite service. Check your connection and retry.'
        : code === 'TIMEOUT' ? 'The satellite request timed out. Try a shorter range or retry later.'
        : 'The satellite service could not complete this request. Try again later.');
    this.failure = { step, code, message };
    this.loading = null;
    return EMPTY;
  }

  private setChart(observations: SatelliteObservation[]): void {
    const measured = observations.filter(item => item.status === 'COMPLETE' && item.statistics);
    const start = Date.parse(this.activeRange!.startDate);
    const span = Date.parse(this.activeRange!.endDate) + DAY - start;
    this.historyPoints = measured.map(observation => ({
      observation,
      x: 10 + 280 * (Date.parse(observation.observedAt) - start) / span,
      y: 10 + 100 * (1 - observation.statistics!.mean) / 2,
    }));
    this.chartLine = this.historyPoints.map(({ x, y }) => `${x},${y}`).join(' ');
  }

  private calendarDate(value: string): boolean {
    const timestamp = Date.parse(value);
    return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(timestamp)
      && new Date(timestamp).toISOString().slice(0, 10) === value;
  }
}

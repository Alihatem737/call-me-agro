import { PlanStorageService, PLANS_STORAGE_KEY } from './plan-storage.service';
import { isValidFieldBoundary } from '../models/field-boundary';

describe('PlanStorageService', () => {
  const plan = { id: 'north', name: 'North Field', location: 'Dakahlia, Egypt', journey: 'already-planted' as const };
  let service: PlanStorageService;
  let read: jasmine.Spy;

  beforeEach(() => {
    service = new PlanStorageService();
    read = spyOn(Storage.prototype, 'getItem');
  });

  it('returns an empty state for missing storage', () => {
    read.and.returnValue(null);
    expect(service.load()).toEqual({ plans: [], error: '' });
    expect(read).toHaveBeenCalledWith(PLANS_STORAGE_KEY);
  });

  it('preserves saved IDs and journey data across reads', () => {
    read.and.returnValue(JSON.stringify([plan]));
    expect(service.load().plans).toEqual([plan]);
    expect(service.load().plans).toEqual([plan]);
  });

  it('rejects malformed JSON without changing storage', () => {
    read.and.returnValue('{');
    const write = spyOn(Storage.prototype, 'setItem');
    const result = service.load();
    expect(result.plans).toEqual([]);
    expect(result.error).not.toBe('');
    expect(write).not.toHaveBeenCalled();
  });

  it('rejects a non-array payload', () => {
    read.and.returnValue(JSON.stringify(plan));
    expect(service.load().error).not.toBe('');
  });

  it('retains valid records and reports invalid or duplicate entries', () => {
    read.and.returnValue(JSON.stringify([null, plan, plan, { ...plan, id: 'other', name: ' ' }, { ...plan, id: 'bad', journey: 'unknown' }]));
    const result = service.load();
    expect(result.plans).toEqual([plan]);
    expect(result.error).not.toBe('');
  });

  it('handles blocked browser storage', () => {
    read.and.throwError('Storage blocked');
    expect(service.load().error).not.toBe('');
  });

  it('accepts small simple outlines and rejects crossing, touching, overlapping and degenerate edges', () => {
    const valid = [[31.04, 31.38], [31.04001, 31.38], [31.04001, 31.38001], [31.04, 31.38001]];
    const cases = [
      valid,
      [[0, 179.99], [0, -179.99], [1, -179.99], [1, 179.99]],
      [[0, 0], [2, 2], [2, 0], [0, 2]],
      [[0, 0], [0, 2], [2, 2], [0, 1], [2, 0]],
      [[0, 0], [0, 2], [0, 1], [1, 0]],
      [[0, 0], [0, 1], [0, 2]],
      [[0, 0], [1, 0], [0, 0]],
      [[0, 0], [91, 0], [1, 1]],
      [[0, 0], [1, 1]],
    ];
    expect(cases.map(points => isValidFieldBoundary(points.map(([latitude, longitude]) => ({ latitude, longitude })))))
      .toEqual([true, true, false, false, false, false, false, false, false]);
  });

  it('rejects planned, missing and unreadable records and reports a failed write for a growing record', () => {
    const outline = [{ latitude: 0, longitude: 0 }, { latitude: 1, longitude: 0 }, { latitude: 1, longitude: 1 }];
    const planned = {
      ...plan, journey: 'planning-to-plant', status: 'planned', latitude: 0, longitude: 0, selectedCrop: 'potato',
      plantingWindow: { from: '2026-12-01', to: '2027-01-01' },
    };
    const write = spyOn(Storage.prototype, 'setItem').and.throwError('Storage blocked');
    read.and.returnValue(JSON.stringify([planned]));
    expect(service.updateFieldBoundary(plan.id, outline)).toContain('growing plan');
    expect(service.updateFieldBoundary('missing', outline)).toContain('growing plan');
    read.and.returnValue('{');
    expect(service.updateFieldBoundary(plan.id, outline)).toContain('could not be loaded');
    expect(write).not.toHaveBeenCalled();

    read.and.returnValue(JSON.stringify([{ ...planned, status: 'growing' }]));
    expect(service.updateFieldBoundary(plan.id, outline)).toContain('could not be saved');
    expect(write).toHaveBeenCalledTimes(1);
  });
});

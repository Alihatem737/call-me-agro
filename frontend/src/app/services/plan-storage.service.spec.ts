import { PlanStorageService, PLANS_STORAGE_KEY } from './plan-storage.service';

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
});

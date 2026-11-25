import { describe, it, expect } from 'vitest';
import { kindsFor, parseSqft, recordKind, recordStatus, type BuildingFacts, type BuildingRecord } from '@/lib/buildingRecords';
import { allObligations, obligationRows, recordObligations, recordRows, recordsSummary, rhythmOf, type BuildingSnapshot } from '@/ux2/building/metrics';

const facts = (over: Partial<BuildingFacts> = {}): BuildingFacts => ({ state: 'DC', grossSqft: 78500, hasElevator: true, hasBoiler: true, ...over });
const rec = (kind: string, over: Partial<BuildingRecord> = {}): BuildingRecord => ({ id: `${kind}-${over.doneOn ?? 'x'}`, kind, name: '', number: '', doneOn: '2026-01-10', expiresOn: '', posted: false, notes: '', ...over });
const ids = (f: BuildingFacts, want?: 'yes' | 'check') => kindsFor(f).filter(k => !want || k.applies === want).map(k => k.kind.id);

describe('which records a building should hold', () => {
  it('gives a large DC building with an elevator and boiler the full list', () => {
    expect(ids(facts(), 'yes')).toEqual(['certificate-of-occupancy', 'elevator-certificate', 'boiler-certificate', 'heating-inspection', 'fire-alarm-test', 'fire-extinguishers', 'smoke-detector-test', 'energy-benchmarking']);
    // The fire alarm notice is good practice, not law, since its statute was repealed in 2016.
    expect(ids(facts(), 'check')).toEqual(['business-licence', 'fire-alarm-notice']);
  });
  it('finds DC however the state was typed', () => {
    expect(ids(facts({ state: 'District of Columbia' }))).toContain('certificate-of-occupancy');
  });
  it('drops the elevator certificate without an elevator and asks about the boiler when none is listed', () => {
    const f = facts({ hasElevator: false, hasBoiler: false });
    expect(ids(f)).not.toContain('elevator-certificate');
    expect(ids(f, 'check')).toEqual(expect.arrayContaining(['boiler-certificate', 'heating-inspection']));
  });
  it('decides energy benchmarking from the floor area', () => {
    expect(ids(facts({ grossSqft: 60000 }), 'yes')).toContain('energy-benchmarking');
    expect(ids(facts({ grossSqft: 30000 }), 'check')).toContain('energy-benchmarking');
    expect(ids(facts({ grossSqft: null }), 'check')).toContain('energy-benchmarking');
    expect(ids(facts({ grossSqft: 6000 }))).not.toContain('energy-benchmarking');
  });
  it('keeps only the general fire and equipment records outside DC', () => {
    expect(ids(facts({ state: 'Maryland' }))).toEqual(['elevator-certificate', 'boiler-certificate', 'fire-alarm-test', 'fire-extinguishers']);
  });
  it('reads a floor area out of free text', () => {
    expect(parseSqft('78,500 sq ft')).toBe(78500);
    expect(parseSqft('52000')).toBe(52000);
    expect(parseSqft('')).toBeNull();
    expect(parseSqft('unknown')).toBeNull();
  });
});

describe('where a record stands', () => {
  const today = '2026-11-23';
  const k = (id: string) => recordKind(id)!;
  it('is missing with nothing on file', () => {
    expect(recordStatus(k('elevator-certificate'), [], today).state).toBe('missing');
  });
  it('holds a one-time certificate indefinitely and notices it is not posted', () => {
    const st = recordStatus(k('certificate-of-occupancy'), [rec('certificate-of-occupancy')], today);
    expect(st).toMatchObject({ state: 'current', unposted: true });
    expect(recordStatus(k('certificate-of-occupancy'), [rec('certificate-of-occupancy', { posted: true })], today).unposted).toBe(false);
  });
  it('follows the expiry on a certificate, using the latest entry', () => {
    const old = rec('elevator-certificate', { doneOn: '2025-08-20', expiresOn: '2026-08-20' });
    expect(recordStatus(k('elevator-certificate'), [old], today)).toMatchObject({ state: 'lapsed', due: '2026-08-20' });
    const renewed = rec('elevator-certificate', { doneOn: '2026-08-18', expiresOn: '2027-08-18' });
    expect(recordStatus(k('elevator-certificate'), [old, renewed], today)).toMatchObject({ state: 'current', due: '2027-08-18', daysLeft: 268 });
    expect(recordStatus(k('elevator-certificate'), [rec('elevator-certificate', { expiresOn: '2026-12-20' })], today).state).toBe('due-soon');
  });
  it('sets the next yearly test from the last one', () => {
    expect(recordStatus(k('fire-alarm-test'), [rec('fire-alarm-test', { doneOn: '2026-06-15' })], today)).toMatchObject({ state: 'current', due: '2027-06-15' });
    expect(recordStatus(k('fire-alarm-test'), [rec('fire-alarm-test', { doneOn: '2025-06-15' })], today)).toMatchObject({ state: 'lapsed', due: '2026-06-15' });
  });
  it('counts the heating inspection only when done inside this year\'s window', () => {
    const kind = k('heating-inspection');
    expect(recordStatus(kind, [rec('heating-inspection', { doneOn: '2026-07-10' })], today)).toMatchObject({ state: 'current', due: '2027-09-01' });
    // Done in February is last season's inspection: this year's was due Sep 1 and is overdue.
    expect(recordStatus(kind, [rec('heating-inspection', { doneOn: '2026-02-10' })], today)).toMatchObject({ state: 'lapsed', due: '2026-09-01' });
    expect(recordStatus(kind, [], '2026-07-20')).toMatchObject({ state: 'due-soon', due: '2026-09-01' });
    expect(recordStatus(kind, [], '2026-03-05').state).toBe('missing');
  });
  it('has benchmarking due April 1 each year', () => {
    const kind = k('energy-benchmarking');
    expect(recordStatus(kind, [rec('energy-benchmarking', { doneOn: '2026-03-20' })], today)).toMatchObject({ state: 'current', due: '2027-04-01' });
    expect(recordStatus(kind, [rec('energy-benchmarking', { doneOn: '2025-03-20' })], '2026-03-01')).toMatchObject({ state: 'due-soon', due: '2026-04-01' });
    expect(recordStatus(kind, [], '2026-05-01')).toMatchObject({ state: 'lapsed', due: '2026-04-01' });
  });
});

describe('building record gaps', () => {
  const snap = (records: BuildingRecord[], f = facts()) => ({ today: '2026-11-23', address: { street: '', city: '', state: 'DC', zip: '' }, records, facts: f } as unknown as BuildingSnapshot);
  it('lists what applies and is missing, and leaves "check" kinds out of the gaps until something is recorded', () => {
    const rows = recordRows(snap([]));
    const sum = recordsSummary(rows);
    expect(sum.gaps.map(r => r.kind.id)).not.toContain('business-licence');
    expect(sum.toCheck.map(r => r.kind.id)).toEqual(['business-licence', 'fire-alarm-notice']);
    expect(sum.inOrder).toBe(0);
    expect(sum.expected).toBe(8);
  });
  it('flags a certificate that is on file but not posted, and clears it once posted', () => {
    const need = (records: BuildingRecord[]) => recordRows(snap(records)).find(r => r.kind.id === 'certificate-of-occupancy')!.needs;
    expect(need([rec('certificate-of-occupancy')])).toBe('unposted');
    expect(need([rec('certificate-of-occupancy', { posted: true })])).toBeNull();
  });
  it('counts a "check" kind once the building records one', () => {
    const rows = recordRows(snap([rec('business-licence', { expiresOn: '2026-10-01', posted: true })]));
    expect(rows.find(r => r.kind.id === 'business-licence')!.needs).toBe('lapsed');
    expect(recordsSummary(rows).expected).toBe(9);
  });
});

describe('a dated record that only might apply', () => {
  it('is not called overdue before the building has recorded one', () => {
    const snap = { today: '2026-11-23', address: { street: '', city: '', state: 'DC', zip: '' }, records: [], facts: facts({ hasBoiler: false }) } as unknown as BuildingSnapshot;
    const row = recordRows(snap).find(r => r.kind.id === 'heating-inspection')!;
    expect(row.applies).toBe('check');
    expect(row.needs).toBeNull();
    expect(recordsSummary(recordRows(snap)).toCheck.map(r => r.kind.id)).toContain('heating-inspection');
  });
});

describe('licences and certificates as obligations', () => {
  const snap = (records: BuildingRecord[]) => ({ today: '2026-11-23', address: { street: '', city: '', state: 'DC', zip: '' }, records, facts: facts(), obligations: [
    { id: 'o1', task: 'Hold board meetings', role: 'President', freq: 'Per meeting', due: 'Per meeting', critical: false, howTo: [], fiduciaryDuty: 'care', scope: 'governance' },
    { id: 'o2', task: 'Adopt the budget', role: 'Treasurer', freq: 'Annual', due: '2026-12-31', critical: true, howTo: [], fiduciaryDuty: 'care', scope: 'governance' },
    { id: 'o3', task: 'Issue resale certificates', role: 'Secretary', freq: 'Within 10 business days', due: 'Per request', critical: false, howTo: [], fiduciaryDuty: 'obedience', scope: 'operations' },
  ], filings: [], completions: {} } as unknown as BuildingSnapshot);

  it('reads how an obligation comes round from how often it recurs', () => {
    expect([rhythmOf('Per meeting', false), rhythmOf('Ongoing', false), rhythmOf('Monthly', false), rhythmOf('Annual', true), rhythmOf('Biennial', true), rhythmOf('Within 10 business days', false), rhythmOf('As needed', false), rhythmOf('Per request', false), rhythmOf('One time', true)])
      .toEqual(['ongoing', 'ongoing', 'ongoing', 'dated', 'dated', 'event', 'event', 'event', 'once']);
    expect(obligationRows(snap([])).map(r => `${r.id}:${r.rhythm}`).sort()).toEqual(['o1:ongoing', 'o2:dated', 'o3:event']);
  });

  it('gives each one a role, a rhythm and a state, and leaves out what only might apply', () => {
    const rows = recordObligations(snap([rec('certificate-of-occupancy', { posted: true }), rec('elevator-certificate', { doneOn: '2025-01-10', expiresOn: '2026-01-10', posted: true })]));
    const by = (id: string) => rows.find(r => r.id === id)!;
    expect(rows.map(r => r.id)).not.toContain('business-licence');
    // Held once and kept: a one-time obligation that is met.
    expect(by('certificate-of-occupancy')).toMatchObject({ kind: 'record', role: 'President', rhythm: 'once', state: 'met', freq: 'Once', task: 'Hold the certificate of occupancy' });
    // A certificate that has run out is overdue, for the officer who looks after the equipment.
    expect(by('elevator-certificate')).toMatchObject({ role: 'Vice President', rhythm: 'dated', state: 'overdue', critical: true });
    // One that applies and is not on file is work to do, and says so.
    expect(by('fire-extinguishers')).toMatchObject({ state: 'in-progress', task: 'Fire extinguisher inspection: none on file' });
    expect(by('energy-benchmarking').role).toBe('Treasurer');
  });

  it('lists them beside the board\'s obligations without changing what the board checklist counts', () => {
    const s = snap([rec('certificate-of-occupancy', { posted: true })]);
    expect(obligationRows(s)).toHaveLength(3);
    const all = allObligations(s);
    expect(all.length).toBeGreaterThan(3);
    expect(all.filter(r => r.kind === 'record').every(r => r.rhythm === 'once' || r.rhythm === 'dated')).toBe(true);
    // Most pressing first.
    expect(['overdue', 'in-progress']).toContain(all[0].state);
  });
});

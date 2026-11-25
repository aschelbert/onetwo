import { describe, it, expect } from 'vitest';
import { coverageOf, readDate, readPolicy, readSummary, standingOf } from '@/lib/policyRead';

const DEC = `Harbor Mutual Insurance Company
COMMERCIAL PROPERTY DECLARATIONS
Policy Number: CPP-4471-2026
Named Insured: Sunny Acres Condominium Association
Policy Period: 10/01/2026 to 10/01/2027 12:01 A.M. standard time
Blanket Building Limit of Insurance $14,000,000
Deductible (All Other Perils): $25,000
Total Annual Premium $21,400.00`;

const ACORD = `CERTIFICATE OF LIABILITY INSURANCE
INSURER A : Granite State Casualty Co NAIC # 12345
INSURED Sunny Acres Condominium
COMMERCIAL GENERAL LIABILITY
POLICY NUMBER GL 00981 77
POLICY EFF (MM/DD/YYYY) 09/30/2026
POLICY EXP (MM/DD/YYYY) 09/30/2027
EACH OCCURRENCE $ 1,000,000
GENERAL AGGREGATE $ 2,000,000`;

const HO6 = `Homeowners Policy Declarations - Condominium Unit-Owners Form HO-6
Insurance Company: Lakeside Indemnity
Policy No. H6 2203918
Insured: Dana Whitfield
Effective Date: March 3, 2026
Expiration Date: March 3, 2027
Coverage A - Dwelling $85,000
Deductible $1,000
Annual Premium $612.00`;

describe('reading an insurance document', () => {
  it('reads dates however they are written', () => {
    expect([readDate('10/01/2027'), readDate('Oct 1, 2027'), readDate('October 1 2027'), readDate('2027-10-01'), readDate('9/30/27')]).toEqual(['2027-10-01', '2027-10-01', '2027-10-01', '2027-10-01', '2027-09-30']);
    expect([readDate('13/45/2027'), readDate('soon')]).toEqual(['', '']);
  });

  it('reads a declarations page', () => {
    expect(readPolicy(DEC)).toEqual({ coverage: 'Property, the building', carrier: 'Harbor Mutual Insurance Company', policyNum: 'CPP-4471-2026', namedInsured: 'Sunny Acres Condominium Association', limit: 14000000, deductible: 25000, premium: 21400, effective: '2026-10-01', expires: '2027-10-01' });
  });

  it('reads a certificate of insurance', () => {
    const r = readPolicy(ACORD);
    expect(r).toMatchObject({ coverage: 'General liability', carrier: 'Granite State Casualty Co', policyNum: 'GL 00981 77', limit: 1000000, effective: '2026-09-30', expires: '2027-09-30' });
    expect(r.premium).toBeUndefined();
  });

  it("reads a unit owner's policy", () => {
    expect(readPolicy(HO6)).toMatchObject({ coverage: "Unit owner's policy (HO-6)", carrier: 'Lakeside Indemnity', policyNum: 'H6 2203918', namedInsured: 'Dana Whitfield', limit: 85000, deductible: 1000, premium: 612, effective: '2026-03-03', expires: '2027-03-03' });
  });

  it('leaves out what it cannot find, and does not guess', () => {
    expect(readPolicy('')).toEqual({});
    expect(readPolicy('Thank you for your business. Call 202-555-0100 with questions about invoice 20261125.')).toEqual({});
    // A period that reads backwards is left for a person.
    const odd = readPolicy('Policy Period: 10/01/2027 to 10/01/2026');
    expect([odd.effective, odd.expires]).toEqual([undefined, undefined]);
    expect(readSummary({}, 'scan.pdf')).toContain('Nothing could be read from scan.pdf');
    expect(readSummary(readPolicy(DEC), 'dec.pdf')).toBe('Read the coverage, the carrier, the policy number, the limit, the deductible, the premium, the expiry date from dec.pdf. Check each one against the document before saving.');
  });

  it('recognises a coverage from what a policy is called', () => {
    expect([coverageOf('D&O')?.id, coverageOf('Directors & Officers (D&O)')?.id, coverageOf('General Liability')?.id, coverageOf('Master Policy')?.id, coverageOf('Fidelity Bond')?.id, coverageOf("Workers' Comp")?.id, coverageOf('Cyber')]).toEqual(['do', 'do', 'liability', 'property', 'fidelity', 'workers', undefined]);
  });

  it('says where a policy stands by its expiry', () => {
    expect([standingOf('2027-03-03', '2026-11-25'), standingOf('2026-12-12', '2026-11-25'), standingOf('2026-11-01', '2026-11-25'), standingOf('', '2026-11-25'), standingOf(undefined, '2026-11-25')]).toEqual(['current', 'expiring', 'lapsed', 'unknown', 'unknown']);
  });
});

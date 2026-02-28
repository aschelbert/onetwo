/**
 * DACI Matrix — maps case category IDs to responsible board roles.
 * Based on DC Code §29-1135, standard DC condo bylaws, and governance best practices.
 *
 * D = Driver (owns execution), A = Approver (final authority),
 * C = Contributor (provides input), I = Informed (kept in the loop)
 */
export interface DACIEntry {
  driver: string;
  approver: string;
  contributor: string[];
  informed: string[];
}

export const DACI_MATRIX: Record<string, DACIEntry> = {
  financial:    { driver: 'Treasurer',       approver: 'President', contributor: ['Secretary'],              informed: ['Vice President'] },
  maintenance:  { driver: 'Vice President',  approver: 'President', contributor: ['Treasurer'],             informed: ['Secretary'] },
  enforcement:  { driver: 'Vice President',  approver: 'President', contributor: ['Secretary'],             informed: ['Treasurer'] },
  legal:        { driver: 'President',       approver: 'President', contributor: ['Treasurer', 'Secretary'], informed: ['Vice President'] },
  governance:   { driver: 'President',       approver: 'President', contributor: ['Secretary'],             informed: ['Vice President', 'Treasurer'] },
  disputes:     { driver: 'Vice President',  approver: 'President', contributor: ['Secretary'],             informed: ['Treasurer'] },
  operations:   { driver: 'Vice President',  approver: 'President', contributor: ['Treasurer'],             informed: ['Secretary'] },
  strategic:    { driver: 'President',       approver: 'President', contributor: ['Treasurer', 'Vice President'], informed: ['Secretary'] },
  crisis:       { driver: 'President',       approver: 'President', contributor: ['Vice President', 'Treasurer'], informed: ['Secretary'] },
  admin:        { driver: 'Secretary',       approver: 'President', contributor: ['Treasurer'],             informed: ['Vice President'] },
};

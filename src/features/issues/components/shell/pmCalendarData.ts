// PM Calendar types, constants, templates, and helpers

export type PMCategory =
  | 'hvac'
  | 'roofing'
  | 'plumbing'
  | 'electrical'
  | 'fire_safety'
  | 'elevator'
  | 'exterior'
  | 'pest_control'
  | 'common_areas'
  | 'other';

export interface PMTask {
  id: string;
  name: string;
  category: PMCategory;
  startMonth: number; // 1-12
  frequency: 'monthly' | 'quarterly' | 'semi-annual' | 'annual';
  vendorId: string | null;
  vendorName: string;
  notes: string;
  eventCreated: boolean;
}

export interface PMCalendarData {
  tasks: PMTask[];
  calendarYear: number;
}

export const PM_CATEGORY_LABELS: Record<PMCategory, string> = {
  hvac: 'HVAC',
  roofing: 'Roofing',
  plumbing: 'Plumbing',
  electrical: 'Electrical',
  fire_safety: 'Fire & Life Safety',
  elevator: 'Elevator',
  exterior: 'Exterior Envelope',
  pest_control: 'Pest Control',
  common_areas: 'Common Areas',
  other: 'Other',
};

export const CATEGORY_DOT_COLORS: Record<PMCategory, string> = {
  hvac: '#3b82f6',
  roofing: '#f59e0b',
  plumbing: '#06b6d4',
  electrical: '#8b5cf6',
  fire_safety: '#ef4444',
  elevator: '#6366f1',
  exterior: '#84cc16',
  pest_control: '#f97316',
  common_areas: '#14b8a6',
  other: '#9ca3af',
};

let _taskCounter = 0;
function templateId(): string {
  return `pmt_${++_taskCounter}_${crypto.randomUUID().slice(0, 6)}`;
}

export const PM_TASK_TEMPLATES: Omit<PMTask, 'id'>[] = [
  // HVAC (4)
  { name: 'HVAC cooling system startup & inspection', category: 'hvac', startMonth: 3, frequency: 'annual', vendorId: null, vendorName: '', notes: '', eventCreated: false },
  { name: 'HVAC filter replacement', category: 'hvac', startMonth: 1, frequency: 'quarterly', vendorId: null, vendorName: '', notes: '', eventCreated: false },
  { name: 'HVAC heating system startup & inspection', category: 'hvac', startMonth: 9, frequency: 'annual', vendorId: null, vendorName: '', notes: '', eventCreated: false },
  { name: 'HVAC ductwork inspection & cleaning', category: 'hvac', startMonth: 2, frequency: 'annual', vendorId: null, vendorName: '', notes: '', eventCreated: false },

  // Roofing (2)
  { name: 'Roof inspection (spring)', category: 'roofing', startMonth: 4, frequency: 'annual', vendorId: null, vendorName: '', notes: '', eventCreated: false },
  { name: 'Roof inspection (fall) & gutter cleaning', category: 'roofing', startMonth: 10, frequency: 'annual', vendorId: null, vendorName: '', notes: '', eventCreated: false },

  // Plumbing (3)
  { name: 'Backflow preventer testing', category: 'plumbing', startMonth: 5, frequency: 'annual', vendorId: null, vendorName: '', notes: '', eventCreated: false },
  { name: 'Water heater flush & inspection', category: 'plumbing', startMonth: 3, frequency: 'annual', vendorId: null, vendorName: '', notes: '', eventCreated: false },
  { name: 'Sump pump & ejector pit inspection', category: 'plumbing', startMonth: 3, frequency: 'semi-annual', vendorId: null, vendorName: '', notes: '', eventCreated: false },

  // Electrical (2)
  { name: 'Emergency lighting & exit sign testing', category: 'electrical', startMonth: 1, frequency: 'semi-annual', vendorId: null, vendorName: '', notes: '', eventCreated: false },
  { name: 'Electrical panel & switchgear inspection', category: 'electrical', startMonth: 6, frequency: 'annual', vendorId: null, vendorName: '', notes: '', eventCreated: false },

  // Fire & Life Safety (3)
  { name: 'Fire alarm system inspection (NFPA 72)', category: 'fire_safety', startMonth: 1, frequency: 'semi-annual', vendorId: null, vendorName: '', notes: '', eventCreated: false },
  { name: 'Fire sprinkler system inspection', category: 'fire_safety', startMonth: 1, frequency: 'annual', vendorId: null, vendorName: '', notes: '', eventCreated: false },
  { name: 'Fire extinguisher inspection', category: 'fire_safety', startMonth: 1, frequency: 'monthly', vendorId: null, vendorName: '', notes: '', eventCreated: false },

  // Elevator (2)
  { name: 'Elevator preventative maintenance', category: 'elevator', startMonth: 1, frequency: 'monthly', vendorId: null, vendorName: '', notes: '', eventCreated: false },
  { name: 'Elevator annual safety inspection (DLCP)', category: 'elevator', startMonth: 4, frequency: 'annual', vendorId: null, vendorName: '', notes: '', eventCreated: false },

  // Exterior (3)
  { name: 'Exterior caulking & sealant inspection', category: 'exterior', startMonth: 4, frequency: 'annual', vendorId: null, vendorName: '', notes: '', eventCreated: false },
  { name: 'Parking lot / garage inspection & sweeping', category: 'exterior', startMonth: 4, frequency: 'semi-annual', vendorId: null, vendorName: '', notes: '', eventCreated: false },
  { name: 'Exterior painting & touch-up', category: 'exterior', startMonth: 6, frequency: 'annual', vendorId: null, vendorName: '', notes: '', eventCreated: false },

  // Pest Control (2)
  { name: 'Pest control treatment (interior)', category: 'pest_control', startMonth: 1, frequency: 'quarterly', vendorId: null, vendorName: '', notes: '', eventCreated: false },
  { name: 'Pest control treatment (exterior perimeter)', category: 'pest_control', startMonth: 4, frequency: 'semi-annual', vendorId: null, vendorName: '', notes: '', eventCreated: false },

  // Common Areas (2)
  { name: 'Common area deep cleaning', category: 'common_areas', startMonth: 1, frequency: 'quarterly', vendorId: null, vendorName: '', notes: '', eventCreated: false },
  { name: 'Landscape spring prep / fall winterization', category: 'common_areas', startMonth: 4, frequency: 'semi-annual', vendorId: null, vendorName: '', notes: '', eventCreated: false },

  // Other (1)
  { name: 'Boiler inspection & servicing', category: 'other', startMonth: 9, frequency: 'annual', vendorId: null, vendorName: '', notes: '', eventCreated: false },
];

/** Generate hydrated PMTask[] from templates with unique IDs. */
export function hydrateTemplates(): PMTask[] {
  return PM_TASK_TEMPLATES.map(t => ({ ...t, id: templateId() }));
}

const FREQ_INTERVALS: Record<PMTask['frequency'], number> = {
  monthly: 1,
  quarterly: 3,
  'semi-annual': 6,
  annual: 12,
};

/** Returns 1-indexed month numbers where a task occurs in the calendar year. */
export function computeTaskMonths(startMonth: number, frequency: PMTask['frequency']): number[] {
  const interval = FREQ_INTERVALS[frequency];
  const months: number[] = [];
  let m = startMonth;
  while (m <= 12) {
    months.push(m);
    m += interval;
  }
  return months;
}

/** Group tasks by month (1-12). Each month maps to the tasks occurring in it. */
export function buildCalendarGrid(tasks: PMTask[]): Record<number, PMTask[]> {
  const grid: Record<number, PMTask[]> = {};
  for (let m = 1; m <= 12; m++) grid[m] = [];
  for (const task of tasks) {
    const months = computeTaskMonths(task.startMonth, task.frequency);
    for (const m of months) {
      grid[m].push(task);
    }
  }
  return grid;
}

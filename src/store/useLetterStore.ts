import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { isBackendEnabled } from '@/lib/supabase';
import * as letterSvc from '@/lib/services/letterEngine';
import type { LetterTemplate, GeneratedLetter } from '@/lib/services/letterEngine';

export type { LetterTemplate, GeneratedLetter } from '@/lib/services/letterEngine';

interface LetterState {
  templates: LetterTemplate[];
  letters: GeneratedLetter[];
  loadFromDb: (tenantId: string) => Promise<void>;
  addTemplate: (t: Omit<LetterTemplate, 'id'>, tenantId?: string) => void;
  updateTemplate: (id: string, updates: Partial<LetterTemplate>) => void;
  deleteTemplate: (id: string) => void;
  addLetter: (l: Omit<GeneratedLetter, 'id'>, tenantId?: string) => void;
  updateLetter: (id: string, updates: Partial<GeneratedLetter>) => void;
  deleteLetter: (id: string) => void;
}

export const useLetterStore = create<LetterState>()(persist((set) => ({
  templates: [
    { id: 'lt1', name: 'Violation Notice — First', category: 'violation', subject: 'Notice of Violation — {{violation_type}}', body: 'Dear {{owner_name}},\n\nThis letter is to notify you that your unit ({{unit_number}}) is in violation of the association\'s rules and regulations regarding {{violation_type}}.\n\nSpecifically: {{violation_details}}\n\nYou have {{cure_period}} days from the date of this notice to correct the violation. Failure to do so may result in fines as outlined in the governing documents.\n\nPlease contact the management office if you have questions.\n\nSincerely,\n{{sender_name}}\n{{sender_title}}', variables: [{ name: 'owner_name', label: 'Owner Name', defaultValue: '' }, { name: 'unit_number', label: 'Unit Number', defaultValue: '' }, { name: 'violation_type', label: 'Violation Type', defaultValue: '' }, { name: 'violation_details', label: 'Violation Details', defaultValue: '' }, { name: 'cure_period', label: 'Cure Period (days)', defaultValue: '30' }, { name: 'sender_name', label: 'Sender Name', defaultValue: '' }, { name: 'sender_title', label: 'Sender Title', defaultValue: 'Board President' }] },
    { id: 'lt2', name: 'Collection — Past Due Notice', category: 'collection', subject: 'Past Due Assessment Notice — Unit {{unit_number}}', body: 'Dear {{owner_name}},\n\nOur records indicate that your unit ({{unit_number}}) has an outstanding balance of {{amount_due}}. This amount was due on {{due_date}}.\n\nPer the association\'s collection policy, late fees of {{late_fee}} per month will be assessed on unpaid balances. Please remit payment within {{days_to_pay}} days to avoid further action.\n\nPayment can be made via the resident portal or by check to the management office.\n\nSincerely,\n{{sender_name}}\nTreasurer', variables: [{ name: 'owner_name', label: 'Owner Name', defaultValue: '' }, { name: 'unit_number', label: 'Unit Number', defaultValue: '' }, { name: 'amount_due', label: 'Amount Due', defaultValue: '' }, { name: 'due_date', label: 'Due Date', defaultValue: '' }, { name: 'late_fee', label: 'Late Fee', defaultValue: '$25' }, { name: 'days_to_pay', label: 'Days to Pay', defaultValue: '15' }, { name: 'sender_name', label: 'Sender Name', defaultValue: '' }] },
    { id: 'lt3', name: 'Welcome Letter — New Owner', category: 'welcome', subject: 'Welcome to {{building_name}}!', body: 'Dear {{owner_name}},\n\nOn behalf of the Board of Directors, welcome to {{building_name}}! We are pleased to have you as a member of our community.\n\nHere is some important information:\n\n- Monthly assessment: {{monthly_fee}} due on the 1st of each month\n- Resident portal: Access at {{portal_url}}\n- Emergency maintenance line: {{emergency_phone}}\n- Move-in coordinator: Contact the management office to schedule\n\nPlease review the attached house rules and resident handbook. If you have any questions, don\'t hesitate to reach out.\n\nWelcome home!\n\n{{sender_name}}\n{{sender_title}}', variables: [{ name: 'owner_name', label: 'Owner Name', defaultValue: '' }, { name: 'building_name', label: 'Building Name', defaultValue: 'Sunny Acres Condominium' }, { name: 'monthly_fee', label: 'Monthly Fee', defaultValue: '' }, { name: 'portal_url', label: 'Portal URL', defaultValue: '' }, { name: 'emergency_phone', label: 'Emergency Phone', defaultValue: '202-555-9111' }, { name: 'sender_name', label: 'Sender Name', defaultValue: '' }, { name: 'sender_title', label: 'Sender Title', defaultValue: 'Board President' }] },
    { id: 'lt4', name: 'Maintenance Notice', category: 'maintenance', subject: 'Scheduled Maintenance — {{work_type}}', body: 'Dear Residents,\n\nPlease be advised that {{work_type}} has been scheduled for {{work_date}}.\n\nDetails:\n- Scope: {{work_scope}}\n- Duration: {{duration}}\n- Areas affected: {{affected_areas}}\n- Contractor: {{contractor_name}}\n\n{{additional_notes}}\n\nWe apologize for any inconvenience. Please contact the management office with questions.\n\n{{sender_name}}\n{{sender_title}}', variables: [{ name: 'work_type', label: 'Work Type', defaultValue: '' }, { name: 'work_date', label: 'Date', defaultValue: '' }, { name: 'work_scope', label: 'Scope', defaultValue: '' }, { name: 'duration', label: 'Duration', defaultValue: '' }, { name: 'affected_areas', label: 'Affected Areas', defaultValue: '' }, { name: 'contractor_name', label: 'Contractor', defaultValue: '' }, { name: 'additional_notes', label: 'Additional Notes', defaultValue: '' }, { name: 'sender_name', label: 'Sender Name', defaultValue: '' }, { name: 'sender_title', label: 'Sender Title', defaultValue: 'Vice President' }] },
  ],
  letters: [],

  loadFromDb: async (tenantId: string) => {
    const [templates, letters] = await Promise.all([
      letterSvc.fetchTemplates(tenantId),
      letterSvc.fetchLetters(tenantId),
    ]);
    const updates: Partial<LetterState> = {};
    if (templates) updates.templates = templates;
    if (letters) updates.letters = letters;
    if (Object.keys(updates).length > 0) set(updates);
  },

  addTemplate: (t, tenantId?) => {
    const id = 'lt' + Date.now();
    set(s => ({ templates: [{ id, ...t }, ...s.templates] }));
    if (isBackendEnabled && tenantId) {
      letterSvc.createTemplate(tenantId, t).then(dbRow => {
        if (dbRow) set(s => ({ templates: s.templates.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      });
    }
  },

  updateTemplate: (id, updates) => {
    set(s => ({ templates: s.templates.map(t => t.id === id ? { ...t, ...updates } : t) }));
    if (isBackendEnabled) letterSvc.updateTemplate(id, updates);
  },

  deleteTemplate: (id) => {
    set(s => ({ templates: s.templates.filter(t => t.id !== id) }));
    if (isBackendEnabled) letterSvc.deleteTemplate(id);
  },

  addLetter: (l, tenantId?) => {
    const id = 'gl' + Date.now();
    set(s => ({ letters: [{ id, ...l }, ...s.letters] }));
    if (isBackendEnabled && tenantId) {
      letterSvc.createLetter(tenantId, l).then(dbRow => {
        if (dbRow) set(s => ({ letters: s.letters.map(x => x.id === id ? { ...x, id: dbRow.id } : x) }));
      });
    }
  },

  updateLetter: (id, updates) => {
    set(s => ({ letters: s.letters.map(l => l.id === id ? { ...l, ...updates } : l) }));
    if (isBackendEnabled) letterSvc.updateLetter(id, updates);
  },

  deleteLetter: (id) => {
    set(s => ({ letters: s.letters.filter(l => l.id !== id) }));
    if (isBackendEnabled) letterSvc.deleteLetter(id);
  },
}), {
  name: 'onetwo-letters',
  merge: (persisted: any, current: any) => ({
    ...current,
    ...(persisted || {}),
  }),
}));

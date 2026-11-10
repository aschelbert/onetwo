/**
 * Letter templates are the building's own rows. A building with none gets the
 * built-ins written once, a building with rows shows exactly them, letters
 * load as they are (none means none), and a building switch resets both.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useLetterStore } from '@/store/useLetterStore';
import { builtinLetterTemplates } from '@/data/letterTemplates';
import * as letterSvc from '@/lib/services/letterEngine';
import type { GeneratedLetter, LetterTemplate } from '@/lib/services/letterEngine';

vi.mock('@/lib/services/letterEngine', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/services/letterEngine')>()),
  fetchTemplates: vi.fn(),
  fetchLetters: vi.fn(),
  createTemplates: vi.fn(),
}));

const TENANT = '00000000-0000-4000-8000-000000000003';
const own: LetterTemplate = { id: 'a1b2c3d4-0000-4000-8000-000000000001', name: 'Pool rules reminder', category: 'notice', subject: 'Pool', body: 'Dear {{owner_name}}', variables: [], builtinKey: null };
const letter: GeneratedLetter = { id: 'l1', templateId: own.id, templateName: own.name, recipient: 'Unit 2B', unitNumber: '2B', subject: 'Pool', body: '…', status: 'sent', sentDate: '2026-11-01', sentVia: 'email', createdBy: 'Board' };
const withIds = (ts: typeof builtinLetterTemplates): LetterTemplate[] => ts.map((t, i) => ({ ...t, id: `00000000-0000-4000-8000-0000000001${String(i).padStart(2, '0')}` }));

beforeEach(() => {
  vi.mocked(letterSvc.createTemplates).mockReset();
  useLetterStore.setState({ letters: [letter] });
  useLetterStore.getState().reset();
});

describe('the built-ins', () => {
  it('are 26 templates, each with its own key, and show in memory before a building loads', () => {
    expect(builtinLetterTemplates.length).toBe(26);
    expect(new Set(builtinLetterTemplates.map(t => t.builtinKey)).size).toBe(26);
    expect(useLetterStore.getState().templates.map(t => t.id)).toEqual(builtinLetterTemplates.map(t => t.builtinKey));
    expect(useLetterStore.getState().letters).toEqual([]);
  });
});

describe('loading a building', () => {
  it('with no templates: writes the built-ins once and shows the rows that come back, with their real ids', async () => {
    vi.mocked(letterSvc.fetchTemplates).mockResolvedValue([]);
    vi.mocked(letterSvc.fetchLetters).mockResolvedValue([]);
    vi.mocked(letterSvc.createTemplates).mockResolvedValue(withIds(builtinLetterTemplates));
    await useLetterStore.getState().loadFromDb(TENANT);
    expect(letterSvc.createTemplates).toHaveBeenCalledTimes(1);
    expect(vi.mocked(letterSvc.createTemplates).mock.calls[0][0]).toBe(TENANT);
    expect(vi.mocked(letterSvc.createTemplates).mock.calls[0][1].length).toBe(26);
    const templates = useLetterStore.getState().templates;
    expect(templates.length).toBe(26);
    expect(templates.every(t => t.id.startsWith('00000000-') && t.builtinKey)).toBe(true);
  });

  it('with no templates and a failed write: keeps showing the built-ins from memory', async () => {
    vi.mocked(letterSvc.fetchTemplates).mockResolvedValue([]);
    vi.mocked(letterSvc.fetchLetters).mockResolvedValue([]);
    vi.mocked(letterSvc.createTemplates).mockResolvedValue(null);
    await useLetterStore.getState().loadFromDb(TENANT);
    expect(useLetterStore.getState().templates.length).toBe(26);
  });

  it('with its own templates: shows exactly those, built-ins included only as rows the building holds', async () => {
    vi.mocked(letterSvc.fetchTemplates).mockResolvedValue([own]);
    vi.mocked(letterSvc.fetchLetters).mockResolvedValue([letter]);
    await useLetterStore.getState().loadFromDb(TENANT);
    expect(useLetterStore.getState().templates).toEqual([own]);
    expect(useLetterStore.getState().letters).toEqual([letter]);
    expect(letterSvc.createTemplates).not.toHaveBeenCalled();
  });

  it('with templates but no letters: shows no letters, not the previous building\'s', async () => {
    useLetterStore.setState({ letters: [letter] });
    vi.mocked(letterSvc.fetchTemplates).mockResolvedValue([own]);
    vi.mocked(letterSvc.fetchLetters).mockResolvedValue([]);
    await useLetterStore.getState().loadFromDb(TENANT);
    expect(useLetterStore.getState().letters).toEqual([]);
  });

  it('that cannot be read: leaves what is showing alone', async () => {
    vi.mocked(letterSvc.fetchTemplates).mockResolvedValue(null);
    vi.mocked(letterSvc.fetchLetters).mockResolvedValue(null);
    await useLetterStore.getState().loadFromDb(TENANT);
    expect(useLetterStore.getState().templates.length).toBe(26);
    expect(letterSvc.createTemplates).not.toHaveBeenCalled();
  });
});

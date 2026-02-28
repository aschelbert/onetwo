// Maps case category/situation to relevant letter template categories (ordered by relevance)

export const CASE_TEMPLATE_MAP: Record<string, string[]> = {
  enforcement: ['violation', 'general', 'notice'],
  financial:   ['collection', 'notice'],
  maintenance: ['maintenance', 'notice'],
  governance:  ['notice'],
  legal:       ['notice', 'general'],
  disputes:    ['violation', 'notice'],
  operations:  ['notice', 'general'],
  strategic:   ['notice', 'general'],
  crisis:      ['notice', 'general'],
  admin:       ['general', 'notice'],
};

export const SIT_TEMPLATE_MAP: Record<string, string[]> = {
  'covenant-violations':   ['violation'],
  'fine-hearings':         ['violation'],
  'delinquent-accounts':   ['collection'],
  'special-assessments':   ['collection'],
  'architectural-review':  ['general'],
  'common-area-repairs':   ['maintenance'],
  'emergency-situations':  ['notice'],
  'vendor-management':     ['general'],
  'insurance-claims':      ['notice', 'general'],
  'neighbor-conflicts':    ['violation', 'notice'],
  'damage-responsibility': ['notice'],
};

export function getSuggestedTemplateCategories(catId: string, sitId: string): string[] {
  return SIT_TEMPLATE_MAP[sitId] || CASE_TEMPLATE_MAP[catId] || ['general'];
}

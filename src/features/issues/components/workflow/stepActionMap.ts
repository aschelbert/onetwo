import type { CaseStep } from '@/types/issues';

export interface RichAction {
  id: string;
  icon: string;
  label: string;
  description: string;
  type: 'navigate' | 'modal' | 'inline';
  target: string;
  primary?: boolean;
  isAction?: boolean;  // true = in-step action, false = navigates away
}

export function deriveActionsForStep(step: CaseStep): RichAction[] {
  const actions: RichAction[] = [];
  const usedTargets = new Set<string>();

  // 1. Existing step.action becomes primary
  if (step.action) {
    const isAction = step.action.type !== 'navigate';
    actions.push({
      id: `action-${step.id}`,
      icon: step.action.type === 'navigate' ? '↗' : step.action.type === 'inline' ? '📊' : '➕',
      label: step.action.label,
      description: step.action.type === 'navigate' ? 'Open in product' : step.action.type === 'inline' ? 'View inline analysis' : 'Open dialog',
      type: step.action.type,
      target: step.action.target,
      primary: true,
      isAction,
    });
    usedTargets.add(step.action.target);
  }

  const d = (step.d || '').toLowerCase();
  const s = (step.s || '').toLowerCase();

  // 2. Fiscal Lens references in d field
  if (d.includes('fiscal lens: dashboard') || d.includes('fiscal lens:dashboard')) {
    actions.push({ id: `fl-dash-${step.id}`, icon: '📊', label: 'Open Financial Dashboard', description: 'View financial overview in Fiscal Lens', type: 'navigate', target: 'financial:dashboard', isAction: false });
  }
  if (d.includes('fiscal lens: reserves') || d.includes('fiscal lens:reserves')) {
    actions.push({ id: `fl-res-${step.id}`, icon: '🏦', label: 'Open Reserves', description: 'Review reserve fund status and projections', type: 'navigate', target: 'financial:reserves', isAction: false });
  }
  if (d.includes('fiscal lens: budget') || d.includes('fiscal lens:budget')) {
    actions.push({ id: `fl-bud-${step.id}`, icon: '📋', label: 'Open Budget', description: 'Review budget allocations and spending', type: 'navigate', target: 'financial:budget', isAction: false });
  }
  if (d.includes('fiscal lens: work orders') || d.includes('fiscal lens:work orders')) {
    actions.push({ id: `fl-wo-${step.id}`, icon: '🔧', label: 'Open Work Orders', description: 'View and manage work orders', type: 'navigate', target: 'financial:workorders', isAction: false });
  }
  if (d.includes('fiscal lens: spending') || d.includes('fiscal lens:spending')) {
    actions.push({ id: `fl-spend-${step.id}`, icon: '💳', label: 'Open Spending Approvals', description: 'Review spending and approvals', type: 'navigate', target: 'financial:approvals', isAction: false });
  }

  // 3. Work Order from step text (if no WO action already)
  if (s.includes('work order') && !usedTargets.has('create-wo')) {
    actions.push({ id: `wo-${step.id}`, icon: '🔧', label: 'Create Work Order', description: 'Create and link a new work order', type: 'modal', target: 'create-wo', isAction: true });
  }

  // 4. Notice/letter/send
  if (s.includes('notice') || s.includes('letter') || s.includes('send')) {
    actions.push({ id: `comm-${step.id}`, icon: '✉️', label: 'Send Communication', description: 'Draft and send a notice or letter', type: 'modal', target: 'send-comm', isAction: true });
  }

  // 5. Owner vote (conduct vote, hold vote — step-level)
  if (/owner vote|conduct.*vote|hold.*vote/.test(s) && !usedTargets.has('owner-vote')) {
    actions.push({ id: `owner-vote-${step.id}`, icon: '🗳️', label: 'Record Owner Vote', description: 'Record the owner vote and resolution', type: 'modal', target: 'owner-vote', isAction: true });
    usedTargets.add('owner-vote');
  }

  // 6. Board vote / board approves (separate from owner vote)
  if ((s.includes('board vote') || s.includes('board approves')) && !usedTargets.has('board-vote')) {
    actions.push({ id: `vote-${step.id}`, icon: '🗳️', label: 'Record Board Vote', description: 'Record the board vote and resolution', type: 'modal', target: 'board-vote', isAction: true });
    usedTargets.add('board-vote');
  }

  // 7. Document / photo / evidence (specific step content)
  if (s.includes('document') || s.includes('photo') || s.includes('evidence')) {
    actions.push({ id: `doc-${step.id}`, icon: '📎', label: 'Upload Document', description: 'Attach evidence or documentation', type: 'modal', target: 'upload-doc', isAction: true });
    usedTargets.add('upload-doc');
  }

  // 8. Meeting / hearing
  if (s.includes('meeting') || s.includes('hearing')) {
    actions.push({ id: `meet-${step.id}`, icon: '📅', label: 'Link Meeting', description: 'Link a meeting or hearing to this case', type: 'modal', target: 'link-meeting', isAction: true });
  }

  // 9. Universal "Upload Document" action — available on every step
  if (!usedTargets.has('upload-doc')) {
    actions.push({ id: `upload-${step.id}`, icon: '📎', label: 'Upload Document', description: 'Attach a document to this step', type: 'modal', target: 'upload-doc', isAction: true });
  }

  return actions;
}

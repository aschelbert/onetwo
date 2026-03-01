import { useEffect } from 'react';
import { useIssuesStore } from '@/store/useIssuesStore';
import { useBuildingStore } from '@/store/useBuildingStore';

interface ConflictCheckPanelProps {
  caseId: string;
  stepId: string;
}

export function ConflictCheckPanel({ caseId, stepId }: ConflictCheckPanelProps) {
  const store = useIssuesStore();
  const { board } = useBuildingStore();
  const c = store.cases.find(x => x.id === caseId);
  const check = c?.conflictChecks?.find(ck => ck.stepId === stepId);

  // Auto-create check if not exists
  useEffect(() => {
    if (!check && board.length > 0) {
      const quorumRequired = Math.ceil(board.length / 2);
      store.addConflictCheck(caseId, {
        stepId,
        declarations: board.map(m => ({
          memberId: m.id,
          memberName: m.name,
          memberRole: m.role,
          hasConflict: null,
          conflictDescription: '',
          recused: false,
          declaredDate: null,
        })),
        quorumRequired,
        quorumMet: false,
        completedDate: null,
      });
    }
  }, [check, board, caseId, stepId, store]);

  if (!check) return null;

  const allDeclared = check.declarations.every(d => d.hasConflict !== null);
  const recusedCount = check.declarations.filter(d => d.recused).length;

  return (
    <div className="space-y-4">
      <p className="text-[10px] font-bold text-ink-400 uppercase tracking-widest">Conflict of Interest Check</p>

      <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-3 flex items-start gap-2">
        <span className="text-yellow-600 mt-0.5">⚖️</span>
        <div>
          <p className="text-[10px] font-bold text-red-600 uppercase tracking-widest mb-0.5">Duty of Loyalty</p>
          <p className="text-sm text-yellow-900">Board members must disclose any personal interest before voting.</p>
        </div>
      </div>

      <div className="space-y-2">
        {check.declarations.map(d => {
          const rowColor = d.hasConflict === null
            ? 'bg-yellow-50 border-l-[3px] border-yellow-300'
            : d.recused
            ? 'bg-red-50 border-l-[3px] border-red-500'
            : 'bg-green-50 border-l-[3px] border-green-500';

          return (
            <div key={d.memberId} className={`${rowColor} rounded-lg p-3`}>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <p className="text-sm font-medium text-ink-900">{d.memberName}</p>
                  <p className="text-xs text-ink-400">{d.memberRole}</p>
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => store.updateConflictDeclaration(caseId, check.id, d.memberId, {
                      hasConflict: false, recused: false, declaredDate: new Date().toISOString().split('T')[0],
                    })}
                    className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                      d.hasConflict === false ? 'bg-sage-500 text-white ring-2 ring-sage-400' : 'bg-sage-100 text-sage-700 hover:bg-sage-200'
                    }`}
                  >
                    No Conflict
                  </button>
                  <button
                    onClick={() => store.updateConflictDeclaration(caseId, check.id, d.memberId, {
                      hasConflict: true, recused: true, declaredDate: new Date().toISOString().split('T')[0],
                    })}
                    className={`px-3 py-1.5 rounded text-xs font-semibold transition-all ${
                      d.hasConflict === true ? 'bg-red-500 text-white ring-2 ring-red-400' : 'bg-red-100 text-red-700 hover:bg-red-200'
                    }`}
                  >
                    Conflict
                  </button>
                </div>
              </div>
              {d.hasConflict && (
                <div className="mt-2">
                  <input
                    value={d.conflictDescription}
                    onChange={e => store.updateConflictDeclaration(caseId, check.id, d.memberId, { conflictDescription: e.target.value })}
                    className="w-full px-3 py-2 border border-red-200 rounded-lg text-sm bg-white"
                    placeholder="Describe the conflict of interest..."
                  />
                  <p className="text-[10px] text-red-600 font-semibold mt-1">Member auto-recused from voting</p>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Quorum display */}
      <div className="bg-mist-50 border border-mist-200 rounded-lg p-3 flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-ink-700">
            Quorum: {check.declarations.length - recusedCount} of {check.declarations.length} members
            {recusedCount > 0 && <span className="text-red-600"> ({recusedCount} recused)</span>}
          </p>
        </div>
        <span className={`text-sm font-bold ${check.quorumMet ? 'text-sage-600' : 'text-red-600'}`}>
          Quorum {check.quorumMet ? '✓' : '✗'}
        </span>
      </div>

      {!allDeclared && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-xs text-amber-800 font-medium">
          ⚠ Cannot proceed to vote until all members have declared.
        </div>
      )}
    </div>
  );
}

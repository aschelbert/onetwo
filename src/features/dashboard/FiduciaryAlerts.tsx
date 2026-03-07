import { useNavigate } from 'react-router-dom';
import type { FiduciaryAlert } from '@/types/issues';

interface FiduciaryAlertsProps {
  alerts: FiduciaryAlert[];
}

const DUTY_COLORS: Record<string, string> = {
  care: 'bg-blue-100 text-blue-700',
  loyalty: 'bg-purple-100 text-purple-700',
  obedience: 'bg-amber-100 text-amber-700',
};

const SEVERITY_COLORS: Record<string, string> = {
  critical: 'bg-red-50 border-l-[3px] border-red-500',
  warning: 'bg-yellow-50 border-l-[3px] border-yellow-500',
  info: 'bg-blue-50 border-l-[3px] border-blue-500',
};

export function FiduciaryAlerts({ alerts }: FiduciaryAlertsProps) {
  const navigate = useNavigate();

  if (alerts.length === 0) return null;

  const criticalCount = alerts.filter(a => a.severity === 'critical').length;

  return (
    <div className="bg-white rounded-xl border border-ink-100 p-4">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-base">⚖️</span>
        <h2 className="text-sm font-bold text-ink-700">Fiduciary Alerts</h2>
        {criticalCount > 0 && <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-bold">{criticalCount} critical</span>}
        <span className="text-[10px] bg-ink-100 text-ink-500 px-1.5 py-0.5 rounded-full font-bold">{alerts.length} total</span>
      </div>
      <div className="space-y-1.5">
        {alerts.map(alert => (
          <button key={alert.id} onClick={() => navigate(alert.actionPath)} className={`${SEVERITY_COLORS[alert.severity]} rounded-lg p-2.5 w-full text-left hover:shadow-sm transition-all`}>
            <div className="flex items-center gap-2 mb-0.5">
              <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${DUTY_COLORS[alert.duty]}`}>
                {alert.duty}
              </span>
              <p className="text-xs font-semibold text-ink-900 truncate flex-1">{alert.title}</p>
              <span className="text-ink-300 text-xs shrink-0">→</span>
            </div>
            <p className="text-[11px] text-ink-600 line-clamp-1">{alert.description}</p>
          </button>
        ))}
      </div>
    </div>
  );
}

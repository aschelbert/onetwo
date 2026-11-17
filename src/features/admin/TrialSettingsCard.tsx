import { useEffect, useState } from 'react';
import { usePlatformAdminStore, effectiveTrialDays } from '@/store/usePlatformAdminStore';
import { isBackendEnabled } from '@/lib/supabase';
import { PLAN_LABELS } from './catalog';
import type { SubscriptionTier } from '@/lib/tiers';

/**
 * Free trial length. Chargebee starts the trial, so the number shown is the
 * one on Chargebee's plan prices; saving writes it there and to platform
 * settings. When Chargebee cannot be reached the field is locked, because a
 * number saved only here would not change what a new signup gets.
 */
export default function TrialSettingsCard({ actor }: { actor: string }) {
  const store = usePlatformAdminStore();
  const { chargebeeTrial: cb, chargebeeTrialError: error, chargebeeTrialLoading: loading, trialDays } = store;
  const [input, setInput] = useState(trialDays);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => { if (isBackendEnabled) void store.loadChargebeeTrial(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setInput(trialDays); }, [trialDays]);

  const readable = !!cb && cb.prices.every(p => p.found);
  const editable = isBackendEnabled && readable && !loading;
  const off = !!cb?.trialOff;
  const pricesDisagree = readable && !off && cb.chargebeeTrialDays === null;
  const settingsBehind = readable && !off && cb.chargebeeTrialDays !== null && cb.storedTrialDays !== cb.chargebeeTrialDays;
  const dirty = editable && (input !== effectiveTrialDays(cb) || !cb.inSync);

  const save = async () => {
    setSaving(true); setSaved(false);
    const ok = await store.updateTrialDays(input);
    setSaving(false);
    if (ok) {
      setSaved(true);
      store.addAuditEntry({ actor, actorRole: 'super_admin', action: 'platform.trial_days_updated', target: 'Platform Settings', details: `Free trial set to ${input} days in Chargebee and platform settings`, buildingId: null });
    }
  };

  return (
    <div className="bg-white rounded-[10px] border border-ink-200 p-5">
      <div className="flex items-center justify-between mb-1">
        <h3 className="font-display text-base font-bold text-ink-900">Free Trial</h3>
        {loading ? <span className="text-xs text-ink-400">Reading Chargebee…</span>
          : readable && cb.inSync ? <span className="text-xs bg-sage-100 text-sage-700 px-2 py-0.5 rounded-full font-semibold">In sync with Chargebee</span>
          : readable ? <span className="text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold">Out of sync</span>
          : <span className="text-xs bg-ink-100 text-ink-500 px-2 py-0.5 rounded-full font-semibold">Chargebee not connected</span>}
      </div>
      <p className="text-sm text-ink-500 mb-4">
        How many days a new building gets free. Saving sets this on every plan price in Chargebee and on the signup page. Buildings already in a trial keep the end date they started with.
      </p>

      <div className="flex items-end gap-3">
        <div>
          <label htmlFor="trial-days" className="block text-xs font-semibold text-ink-600 mb-1">Trial length (days)</label>
          <input
            id="trial-days"
            type="number" min={0} max={365}
            value={input}
            disabled={!editable || saving}
            onChange={e => { setSaved(false); setInput(Math.max(0, Math.min(365, parseInt(e.target.value) || 0))); }}
            className="w-24 px-3 py-2 border border-ink-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sage-300 disabled:bg-ink-50 disabled:text-ink-400 disabled:cursor-not-allowed"
          />
        </div>
        <button
          disabled={!dirty || saving}
          onClick={save}
          className="px-4 py-2 bg-ink-900 text-white text-sm font-semibold rounded-lg hover:bg-ink-800 disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
        >
          {saving ? 'Saving to Chargebee…' : 'Save'}
        </button>
        {isBackendEnabled && !loading && (
          <button onClick={() => void store.loadChargebeeTrial()} disabled={saving} className="px-3 py-2 text-sm font-semibold text-ink-600 hover:text-ink-900 cursor-pointer">Refresh</button>
        )}
        {saved && <span className="text-sm text-sage-700 font-semibold pb-2">Saved</span>}
      </div>

      {!isBackendEnabled && (
        <p className="text-xs text-ink-500 mt-3">Demo data: no backend is connected, so the trial length cannot be read from or saved to Chargebee here.</p>
      )}
      {isBackendEnabled && !loading && !readable && (
        <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">
          Could not read the trial length from Chargebee{error ? `: ${error}` : ''}. This field is locked and shows the last saved value, which may not be what Chargebee gives a new signup. Update the trial period in Chargebee (Product Catalog, Plans, each price point), then refresh.
        </p>
      )}
      {readable && error && (
        <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mt-3">{error}. The values below are what Chargebee holds now.</p>
      )}
      {pricesDisagree && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">Chargebee's plan prices do not all carry the same trial length. Saving sets every one of them to the number above.</p>
      )}
      {settingsBehind && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
          Chargebee gives {cb.chargebeeTrialDays} days, but the signup page is showing {cb.storedTrialDays ?? 'no value'}. Save to make them match.
        </p>
      )}

      {cb && cb.prices.length > 0 && (
        <table className="w-full text-sm mt-4">
          <thead>
            <tr className="text-left text-[0.7rem] uppercase tracking-wide text-ink-500 font-semibold border-b border-ink-200">
              <th className="py-2">Chargebee plan price ({cb.site})</th>
              <th className="py-2">Plan</th>
              <th className="py-2 text-right">Trial in Chargebee</th>
            </tr>
          </thead>
          <tbody>
            {cb.prices.map(p => (
              <tr key={p.id} className="border-b border-ink-100">
                <td className="py-2"><code className="text-xs text-ink-600">{p.id}</code></td>
                <td className="py-2 text-ink-700">{PLAN_LABELS[p.plan as SubscriptionTier] ?? p.plan}, {p.interval}</td>
                <td className="py-2 text-right font-semibold text-ink-900">
                  {!p.found ? <span className="text-red-600">Not found</span>
                    : p.trialDays !== null ? (p.trialDays === 0 ? 'No trial' : `${p.trialDays} days`)
                    : `${p.trialPeriod} ${p.trialPeriodUnit}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="text-xs text-ink-400 mt-3">Set to 0 for no free trial. Maximum 365 days.</p>
    </div>
  );
}

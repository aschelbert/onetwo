'use client'
import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'

type Price = { id: string; plan: string; interval: string; found: boolean; trialDays: number | null; trialPeriod: number | null; trialPeriodUnit: string | null }
type Trial = { site: string; prices: Price[]; chargebeeTrialDays: number | null; storedTrialDays: number | null; inSync: boolean; trialOff?: boolean; effectiveTrialDays?: number | null }

/** What a new signup gets: 0 when the trial is off, otherwise the length Chargebee holds. */
const effectiveDays = (t: Trial) => (t.effectiveTrialDays !== undefined ? t.effectiveTrialDays : t.chargebeeTrialDays)

const PLAN_NAMES: Record<string, string> = { self_managed: 'Self-Managed', facilities: 'Plus Facilities' }

const DEFAULT_TRIAL_DAYS = 21

/**
 * Free trial: on or off, and how long. Chargebee starts the trial, so what is
 * shown is what Chargebee's plan prices hold; saving writes it there and to
 * the setting the signup page and the website read. Off is stored as 0 days.
 * When Chargebee cannot be read the controls are locked, because a value
 * saved only here would not change what a new signup gets.
 */
export function TrialSettingsCard({ lastSavedDays }: { lastSavedDays: number }) {
  const [trial, setTrial] = useState<Trial | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [input, setInput] = useState(lastSavedDays)
  // The length to go back to when the trial is switched on again.
  const [lastLength, setLastLength] = useState(lastSavedDays > 0 ? lastSavedDays : DEFAULT_TRIAL_DAYS)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  const apply = useCallback((status: number, data: Partial<Trial> & { error?: string }) => {
    const next = Array.isArray(data.prices) ? (data as Trial) : null
    if (next) {
      setTrial(next)
      const effective = effectiveDays(next)
      if (effective !== null) setInput(effective)
      if (next.chargebeeTrialDays) setLastLength(next.chargebeeTrialDays)
    } else if (status !== 200) {
      setTrial(null)
    }
    setError(status === 200 ? null : data.error || 'Could not reach Chargebee')
  }, [])

  const read = useCallback(() =>
    fetch('/api/admin/trial-settings')
      .then(async res => apply(res.status, await res.json().catch(() => ({}))))
      .catch(() => apply(502, {}))
      .finally(() => setLoading(false)),
  [apply])

  useEffect(() => { void read() }, [read])

  const refresh = () => { setLoading(true); void read() }

  const readable = !!trial && trial.prices.every(p => p.found)
  const editable = readable && !loading
  const off = !!trial?.trialOff
  const pricesDisagree = readable && !off && trial.chargebeeTrialDays === null
  const settingsBehind = readable && !off && trial.chargebeeTrialDays !== null && trial.storedTrialDays !== trial.chargebeeTrialDays
  const dirty = editable && (input !== effectiveDays(trial) || !trial.inSync)
  const trialOn = input > 0

  function setLength(days: number) {
    setSaved(false)
    setInput(days)
    if (days > 0) setLastLength(days)
  }

  async function save() {
    setSaving(true); setSaved(false)
    try {
      const res = await fetch('/api/admin/trial-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ trial_days: input }),
      })
      apply(res.status, await res.json().catch(() => ({})))
      setSaved(res.ok)
    } catch {
      apply(502, {})
    }
    setSaving(false)
  }

  return (
    <div className="mt-8 bg-white rounded-[10px] border border-gray-200 p-5">
      <div className="flex justify-between items-center mb-1">
        <h3 className="font-serif text-lg font-bold">Free Trial</h3>
        {loading ? <span className="text-xs text-gray-400">Reading Chargebee…</span>
          : readable && off ? <Badge variant="amber">Free trial off</Badge>
          : readable && trial.inSync ? <Badge variant="green">In sync with Chargebee</Badge>
          : readable ? <Badge variant="amber">Out of sync</Badge>
          : <Badge variant="gray">Chargebee not connected</Badge>}
      </div>
      <p className="text-sm text-gray-500 mb-4">
        Whether a new building starts with a free trial, and for how many days. Saving sets this on every plan price in Chargebee, on the signup page and on the website. Buildings already in a trial keep the end date they started with.
      </p>

      <label className="flex items-center gap-2.5 mb-4 w-fit cursor-pointer">
        <input
          type="checkbox"
          role="switch"
          aria-checked={trialOn}
          checked={trialOn}
          disabled={!editable || saving}
          onChange={e => setLength(e.target.checked ? lastLength : 0)}
          className="h-4 w-4 cursor-pointer disabled:cursor-not-allowed"
        />
        <span className="text-sm font-semibold text-gray-800">Offer a free trial</span>
        <span className="text-xs text-gray-500">{trialOn ? 'On' : 'Off: new buildings are billed at signup, and the site says "Start today!"'}</span>
      </label>

      <div className="flex items-end gap-3">
        <div>
          <label htmlFor="trial-days" className="block text-xs font-semibold text-gray-600 mb-1">Trial length (days)</label>
          <Input
            id="trial-days"
            type="number" min={1} max={365}
            value={trialOn ? input : ''}
            placeholder="Off"
            disabled={!editable || saving || !trialOn}
            onChange={e => setLength(Math.max(1, Math.min(365, parseInt(e.target.value) || 1)))}
            className="w-24 disabled:bg-gray-50 disabled:text-gray-400 disabled:cursor-not-allowed"
          />
        </div>
        <Button disabled={!dirty || saving} onClick={save}>{saving ? 'Saving to Chargebee…' : 'Save'}</Button>
        {!loading && <Button variant="ghost" disabled={saving} onClick={refresh}>Refresh</Button>}
        {saved && <span className="text-sm text-green-700 font-semibold pb-2">Saved</span>}
      </div>

      {!loading && !readable && (
        <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 mt-3">
          Could not read the trial length from Chargebee{error ? `: ${error}` : ''}. This field is locked and shows the last value saved here, which may not be what Chargebee gives a new signup. Update the trial period in Chargebee (Product Catalog, Plans, each price point), then refresh.
        </p>
      )}
      {readable && error && (
        <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2 mt-3">{error}. The values below are what Chargebee holds now.</p>
      )}
      {pricesDisagree && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-3">Chargebee&apos;s plan prices do not all carry the same trial length. Saving sets every one of them to the number above.</p>
      )}
      {settingsBehind && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-3">
          Chargebee {trial.chargebeeTrialDays === 0 ? 'has no trial' : `gives ${trial.chargebeeTrialDays} days`}, but the signup page is showing {trial.storedTrialDays === 0 ? 'no trial' : trial.storedTrialDays ?? 'no value'}. Save to make them match.
        </p>
      )}

      {trial && trial.prices.length > 0 && (
        <table className="w-full text-sm mt-4">
          <thead>
            <tr className="text-left text-[0.7rem] uppercase tracking-wide text-gray-500 font-semibold border-b border-gray-200">
              <th className="py-2">Chargebee plan price ({trial.site})</th>
              <th className="py-2">Plan</th>
              <th className="py-2 text-right">{off ? 'Kept in Chargebee' : 'Trial in Chargebee'}</th>
            </tr>
          </thead>
          <tbody>
            {trial.prices.map(p => (
              <tr key={p.id} className="border-b border-gray-100">
                <td className="py-2"><code className="text-xs text-gray-600">{p.id}</code></td>
                <td className="py-2 text-gray-700">{PLAN_NAMES[p.plan] ?? p.plan}, {p.interval}</td>
                <td className="py-2 text-right font-semibold">
                  {!p.found ? <span className="text-red-600">Not found</span>
                    : p.trialDays !== null ? (p.trialDays === 0 ? 'No trial' : `${p.trialDays} days`)
                    : `${p.trialPeriod} ${p.trialPeriodUnit}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {readable && off && (
        <p className="text-xs text-gray-500 mt-3">The trial is off. Checkout tells Chargebee to skip it, so new buildings are billed at signup. The lengths above stay on the plan prices and apply again when the trial is switched back on.</p>
      )}
      <p className="text-xs text-gray-400 mt-3">Between 1 and 365 days. Switch the trial off to bill new buildings at signup.</p>
    </div>
  )
}

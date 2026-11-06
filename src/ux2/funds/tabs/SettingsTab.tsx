import { useState } from 'react';
import FLChartOfAccounts from '@/features/financial/tabs/FLChartOfAccounts';
import FLGeneralLedger from '@/features/financial/tabs/FLGeneralLedger';
import FeeScheduleTab from '@/features/building/tabs/FeeScheduleTab';
import MailingSettingsTab from '@/features/building/tabs/MailingSettingsTab';
import { useFinancialStore } from '@/store/useFinancialStore';
import { Button, Card, Inner, PillTabs, SectionLabel } from '../../components';
import { ordinal, type FundsSnapshot } from '../metrics';

type Section = 'accounts' | 'ledger' | 'rules' | 'fees' | 'mailing';
const SECTIONS: Section[] = ['accounts', 'ledger', 'rules', 'fees', 'mailing'];

/** Billing rules: due day, automatic billing and the late fee. The same store settings the orphaned Payments manager exposed. */
export function BillingRules({ snap }: { snap: FundsSnapshot }) {
  const setHoaDueDay = useFinancialStore(s => s.setHoaDueDay);
  const setAutoBilling = useFinancialStore(s => s.setAutoBilling);
  const setLateFeeSettings = useFinancialStore(s => s.setLateFeeSettings);
  const [day, setDay] = useState(String(snap.hoaDueDay));
  const [amount, setAmount] = useState(String(snap.lateFee.amount));
  const [grace, setGrace] = useState(String(snap.lateFee.graceDays));
  return (
    <Card aria-label="Billing rules">
      <SectionLabel>Runs on its own</SectionLabel>
      <div className="grid gap-3 md:grid-cols-3">
        <Inner className="flex flex-col gap-2">
          <div className="text-sm font-semibold text-ux2-ink">Dues are due on the {ordinal(snap.hoaDueDay)}</div>
          <label className="text-xs text-ux2-muted" htmlFor="rules-day">Day of the month (1–28)</label>
          <div className="flex gap-2">
            <input id="rules-day" inputMode="numeric" value={day} onChange={e => setDay(e.target.value)} className="h-9 w-20 rounded-lg border border-ux2-line px-2 text-sm" />
            <Button size="sm" variant="ghost" onClick={() => { const n = Number(day); if (n >= 1 && n <= 28) setHoaDueDay(n); }}>Save</Button>
          </div>
        </Inner>
        <Inner className="flex flex-col gap-2">
          <div className="text-sm font-semibold text-ux2-ink">Automatic billing · {snap.autoBillingEnabled ? 'On' : 'Off'}</div>
          <p className="text-xs text-ux2-muted">{snap.autoBillingEnabled ? `Every unit is invoiced on the ${ordinal(snap.hoaDueDay)}${snap.lastBillingRun ? ` · last ran ${snap.lastBillingRun.slice(0, 10)}` : ''}.` : 'Invoices are raised by hand from the unit ledger.'}</p>
          <Button size="sm" variant={snap.autoBillingEnabled ? 'ghost' : 'primary'} onClick={() => setAutoBilling(!snap.autoBillingEnabled)}>{snap.autoBillingEnabled ? 'Turn off' : 'Turn on'}</Button>
        </Inner>
        <Inner className="flex flex-col gap-2">
          <div className="text-sm font-semibold text-ux2-ink">Late fee · {snap.lateFee.enabled ? `$${snap.lateFee.amount} after ${snap.lateFee.graceDays} days` : 'Off'}</div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-ux2-muted">
            <label htmlFor="rules-amount">$</label><input id="rules-amount" inputMode="numeric" value={amount} onChange={e => setAmount(e.target.value)} className="h-9 w-20 rounded-lg border border-ux2-line px-2 text-sm text-ux2-ink" />
            <label htmlFor="rules-grace">after</label><input id="rules-grace" inputMode="numeric" value={grace} onChange={e => setGrace(e.target.value)} className="h-9 w-16 rounded-lg border border-ux2-line px-2 text-sm text-ux2-ink" /> days
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={() => setLateFeeSettings(true, Number(amount) || 0, Number(grace) || 0)}>Save and turn on</Button>
            {snap.lateFee.enabled && <Button size="sm" variant="ghost" onClick={() => setLateFeeSettings(false, snap.lateFee.amount, snap.lateFee.graceDays)}>Turn off</Button>}
          </div>
        </Inner>
      </div>
    </Card>
  );
}

export default function SettingsTab({ snap, section, onSection }: { snap: FundsSnapshot; section?: string; onSection: (s: string) => void }) {
  const current: Section = (SECTIONS as string[]).includes(section ?? '') ? (section as Section) : 'accounts';
  return (
    <div className="flex flex-col gap-5">
      <PillTabs
        size="filter"
        aria-label="Accounting settings"
        value={current}
        onChange={onSection}
        tabs={[
          { id: 'accounts', label: 'Chart of accounts' },
          { id: 'ledger', label: 'Ledger' },
          { id: 'rules', label: 'Billing rules' },
          { id: 'fees', label: 'Fee schedule' },
          { id: 'mailing', label: 'Mailing card' },
        ]}
      />
      {current === 'accounts' && <div className="ux2-legacy"><FLChartOfAccounts /></div>}
      {current === 'ledger' && <div className="ux2-legacy"><FLGeneralLedger /></div>}
      {current === 'rules' && <BillingRules snap={snap} />}
      {current === 'fees' && <div className="ux2-legacy"><FeeScheduleTab /></div>}
      {current === 'mailing' && <div className="ux2-legacy"><MailingSettingsTab /></div>}
    </div>
  );
}

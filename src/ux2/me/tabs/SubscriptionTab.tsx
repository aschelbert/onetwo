import SubscriptionPage from '@/features/subscription/SubscriptionPage';
import { useTenantContext } from '@/components/TenantProvider';
import { TIERS, getTierById } from '@/lib/tiers';
import { fmt } from '@/lib/formatters';
import { Card, Chip, Inner, SectionLabel, Tile, TileRow } from '../../components';

export default function SubscriptionTab() {
  const tenant = useTenantContext();
  const tier = getTierById(tenant.tier) ?? TIERS[0];
  const other = TIERS.find(t => t.id !== tier.id);
  return (
    <div className="flex flex-col gap-5">
      <TileRow>
        <Tile tone="navy" label="Plan" meta={<Chip tone="cyan">{tenant.status === 'trial' ? 'Trial' : 'Active'}</Chip>} value={tier.name} sub={`${tier.tagline} · ${fmt(tier.monthly)} a month or ${fmt(tier.annual)} a year`} className="min-h-[170px]" />
        <Tile tone="grey" label="Billing" value={`${fmt(tier.annual)}`} unit="a year" sub={`Yearly saves ${fmt(tier.monthly * 12 - tier.annual)} against twelve monthly invoices · a switch takes effect at the next renewal`} className="min-h-[170px]" />
        <Tile tone="teal" label={other ? other.name : 'Add-ons'} value={other ? `+${fmt(other.annual - tier.annual)}` : '—'} unit={other ? 'a year' : undefined} sub={other ? `${other.tagline} · move up below; a change takes effect at the next billing date` : 'On Call and the Property Manager seat are below'} className="min-h-[170px]" />
      </TileRow>
      <Card aria-label="What the plan includes">
        <SectionLabel>{tier.name} includes</SectionLabel>
        <ul className="m-0 grid list-none gap-1 p-0 sm:grid-cols-2">
          {tier.features.map(f => <li key={f} className="text-sm text-ux2-ink">· {f}</li>)}
        </ul>
        <Inner className="text-xs text-ux2-muted">Paid from operating. Invoices, the billing contact and the payment method live in the billing portal below.</Inner>
      </Card>
      <Card aria-label="Manage plan">
        <SectionLabel>Plan, add-ons, billing interval, invoices and cancellation</SectionLabel>
        <div className="ux2-legacy"><SubscriptionPage embedded /></div>
      </Card>
    </div>
  );
}
